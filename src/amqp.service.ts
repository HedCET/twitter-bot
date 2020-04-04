import { Inject, Injectable, Logger } from '@nestjs/common';
import { connection } from 'amqplib';
import { checkQueue, reply, request } from 'amqplib-rpc';

import { env } from './env.validations';

@Injectable()
export class AmqpService {
  private consumerChannel;
  private publisherChannel;

  constructor(
    @Inject('AMQP') private readonly amqp: connection,
    private readonly logger: Logger,
  ) {}

  async ack(message) {
    if (this.consumerChannel) return await this.consumerChannel.ack(message);
  }

  async reply(
    message: { [key: string]: any },
    payload: any,
    options: { [key: string]: any } = {},
  ) {
    if (!this.publisherChannel)
      this.publisherChannel = await this.amqp.createChannel();
    return await reply(this.publisherChannel, message, payload, options);
  }

  async replyAck(
    message: { [key: string]: any },
    payload: any,
    options: { [key: string]: any } = {},
  ) {
    const response = await this.reply(message, payload, options);
    await this.ack(message);
    return response;
  }

  async request(payload: any, options: { [key: string]: any } = {}) {
    if (await checkQueue(this.amqp, env.AMQP_QUEUE_NAME))
      return await request(this.amqp, env.AMQP_QUEUE_NAME, payload, options);
    this.logger.error(payload, 'failed', 'AmqpService/request');
  }
}
