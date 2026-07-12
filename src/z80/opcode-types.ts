export type OpcodeHandler = () => void;
export type OpcodeTable = OpcodeHandler[];
export const noop: OpcodeHandler = (): void => {
  // intentionally empty
};
