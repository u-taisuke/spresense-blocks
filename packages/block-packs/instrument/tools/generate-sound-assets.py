#!/usr/bin/env python3
"""
「ゆる楽器」パックに同梱する音源WAVファイルを合成生成するスクリプト。

実際の楽器を録音したサンプルではなく、倍音を足し合わせて作った簡易的な合成音
(ピアノ風・サックス風)。著作権・ライセンスが不明な音源ファイルを配布しないために、
録音済み素材を使わずこのスクリプトで完全にゼロから生成している。

出力先は apps/editor/resources/instrument-sounds/ (electron-builder の extraResources で
アプリに同梱され、apps/editor/src/main/sdcard.ts がSDカードへコピーする実体)。
apps/editor/src/renderer/public/blockly-media/ に Blockly のメディアを直接コピーしてある
のと同じ考え方で、生成済みのWAVファイルをそのままリポジトリにコミットしている
(アプリ起動のたびに音声合成をやり直す必要はないため)。

音を追加・変更したいときは、このスクリプトを編集して再実行すればよい:
    python packages/block-packs/instrument/tools/generate-sound-assets.py

【重要】ここで生成するノート番号(MIDIノート番号)は、
packages/block-packs/instrument/src/generators.ts の NOTE_TABLE と完全に一致させること。
一方だけ変更すると、ブロックが存在しないファイルを参照してしまう。

【フォーマット】ssprocLib の PcmRenderer は 48kHz/16bit/2ch のPCMしかサポートしない
(SDSink.cpp のコメントより)。WAVファイルのヘッダーがどうであれ、実際のPCMデータが
この形式でなければ再生されない。
"""

import math
import os
import struct
import wave

SAMPLE_RATE = 48000
BIT_DEPTH = 16
CHANNELS = 2

OUTPUT_ROOT = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "apps", "editor", "resources", "instrument-sounds"
)

# 2オクターブ分の全音音階(ダイアトニックスケール)。シャープ・フラットは含めない
# (子供向けのブロックUIでは「ド・レ・ミ・ファ・ソ・ラ・シ」だけを選べるようにしているため)。
# generators.ts の NOTE_TABLE と一致させること。
NOTES = {
    48: "48_C3",
    50: "50_D3",
    52: "52_E3",
    53: "53_F3",
    55: "55_G3",
    57: "57_A3",
    59: "59_B3",
    60: "60_C4",
    62: "62_D4",
    64: "64_E4",
    65: "65_F4",
    67: "67_G4",
    69: "69_A4",
    71: "71_B4",
}


def note_to_freq(note_number: int) -> float:
    """MIDIノート番号を周波数(Hz)に変換する(A4=69=440Hz基準)。"""
    return 440.0 * (2.0 ** ((note_number - 69) / 12.0))


def synth_piano(freq: float, duration: float) -> list:
    """
    ピアノ風の音を合成する: 倍音を重ねた波形に、指数関数的に減衰する音量エンベロープをかける。
    高い倍音ほど早く減衰させることで、打鍵直後は明るく、次第に丸い音色に近づく効果を狙う。
    """
    n_samples = int(SAMPLE_RATE * duration)
    samples = [0.0] * n_samples
    harmonics = [1.0, 0.55, 0.30, 0.15, 0.08, 0.04]
    base_tau = 0.9  # 減衰の時定数(秒)。高い音ほど短くする。
    tau = base_tau * (220.0 / freq) ** 0.25
    tau = max(0.3, min(tau, 1.1))

    attack_samples = int(SAMPLE_RATE * 0.004)  # 4msのアタック(クリックノイズ防止)

    for i in range(n_samples):
        t = i / SAMPLE_RATE
        value = 0.0
        for h_index, amp in enumerate(harmonics):
            harmonic_number = h_index + 1
            harmonic_tau = tau / math.sqrt(harmonic_number)
            envelope = math.exp(-t / harmonic_tau)
            value += amp * envelope * math.sin(2.0 * math.pi * freq * harmonic_number * t)
        if i < attack_samples:
            value *= i / attack_samples
        samples[i] = value

    return samples


def synth_sax(freq: float, duration: float) -> list:
    """
    サックス風の音を合成する: のこぎり波に近い倍音構成(1/nで減衰)+ ビブラートをかけ、
    アタック(立ち上がり)を遅めにし、末尾をフェードアウトさせて持続音らしさを出す。
    """
    n_samples = int(SAMPLE_RATE * duration)
    samples = [0.0] * n_samples
    n_harmonics = 10
    vibrato_rate = 5.0  # Hz
    vibrato_depth = 0.006  # 周波数に対する比率

    attack_samples = int(SAMPLE_RATE * 0.08)  # 80msのアタック
    release_samples = int(SAMPLE_RATE * 0.15)  # 150msのリリース

    for i in range(n_samples):
        t = i / SAMPLE_RATE
        vibrato = 1.0 + vibrato_depth * math.sin(2.0 * math.pi * vibrato_rate * t)
        value = 0.0
        for harmonic_number in range(1, n_harmonics + 1):
            amp = 1.0 / harmonic_number
            # 高い倍音を少し早めに減衰させ、耳に痛いキンキンした音を抑える。
            amp *= math.exp(-0.05 * (harmonic_number - 1))
            value += amp * math.sin(2.0 * math.pi * freq * harmonic_number * t * vibrato)
        value *= 0.35  # 倍音を足し合わせた分のゲイン調整

        if i < attack_samples:
            value *= i / attack_samples
        elif i > n_samples - release_samples:
            value *= (n_samples - i) / release_samples

        samples[i] = value

    return samples


def normalize(samples: list, peak: float = 0.85) -> list:
    max_abs = max((abs(s) for s in samples), default=0.0)
    if max_abs < 1e-9:
        return samples
    scale = peak / max_abs
    return [s * scale for s in samples]


def write_wav(path: str, samples: list) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(BIT_DEPTH // 8)
        wav_file.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            clamped = max(-1.0, min(1.0, s))
            value = int(clamped * 32767)
            packed = struct.pack("<h", value)
            frames += packed * CHANNELS  # 左右チャンネルに同じ値を書き込む(モノラル相当)
        wav_file.writeframes(bytes(frames))


def main() -> None:
    voices = {
        "Piano": (synth_piano, 1.2),
        "Sax": (synth_sax, 1.2),
    }
    for voice_name, (synth_fn, duration) in voices.items():
        for note_number, suffix in NOTES.items():
            freq = note_to_freq(note_number)
            samples = synth_fn(freq, duration)
            samples = normalize(samples)
            out_path = os.path.join(OUTPUT_ROOT, voice_name, f"{suffix}.wav")
            write_wav(out_path, samples)
            print(f"wrote {out_path} ({freq:.1f} Hz)")


if __name__ == "__main__":
    main()
