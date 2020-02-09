import { connect, connection } from 'amqplib';

import { env } from './env.validations';

export const amqpProviders = [{
  provide: 'AMQP',
  useFactory: async (): Promise<connection> =>
    await connect(env.AMQP_URL),
}];
