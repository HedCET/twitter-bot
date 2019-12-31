let AI = 1;
export const autoIncrementString = (): string =>
  `${(new Date()).getTime()}.${AI++}`;
