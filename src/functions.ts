import * as moment from 'moment';

let AI = 1;
export const randomId = (): string =>
  `${moment().format('X')}.${AI++}`
