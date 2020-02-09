import { Inject, Injectable, Logger } from '@nestjs/common';
import { connection } from 'amqplib';
import { checkQueue, /* checkReplyQueue, */ reply, request } from 'amqplib-rpc';

import { env } from './env.validations';

@Injectable()
export class AmqpService {
  private consumerChannel;
  private publisherChannel;

  constructor(@Inject('AMQP') private readonly amqp: connection) {}

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
    /* if (await checkReplyQueue(this.amqp, message)) */ return await reply(
      this.publisherChannel,
      message,
      payload,
      options,
    );
    // Logger.error(message.content.toString(), 'reply.failed', 'AmqpService');
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
    if (await checkQueue(this.amqp, env.AMQP_QUEUE))
      return await request(this.amqp, env.AMQP_QUEUE, payload, options);
    Logger.error(JSON.stringify(payload), 'request.failed', 'AmqpService');
  }
}
