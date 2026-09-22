export type MountState = {
  current: boolean;
  mount: () => void;
  unmount: () => void;
};

export function createMountState(initial = false): MountState {
  let value = initial;
  return {
    get current() {
      return value;
    },
    set current(next: boolean) {
      value = next;
    },
    mount() {
      value = true;
    },
    unmount() {
      value = false;
    },
  };
}

export type LatestRequest = {
  begin: () => number;
  isCurrent: (id: number) => boolean;
};

export function createLatestRequest(): LatestRequest {
  let seq = 0;
  return {
    begin: () => ++seq,
    isCurrent: (id: number) => id === seq,
  };
}

export function canApplyResponse(mountState: MountState, latestRequest: LatestRequest, sequence: number): boolean {
  return mountState.current && latestRequest.isCurrent(sequence);
}