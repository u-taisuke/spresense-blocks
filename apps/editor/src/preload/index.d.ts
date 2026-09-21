import type { SpresenseApi } from "./index";

declare global {
  interface Window {
    spresense: SpresenseApi;
  }
}
