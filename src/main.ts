import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import * as expressRateLimit from 'express-rate-limit';
import * as helmet from 'helmet';
import * as mongoose from 'mongoose';

import { AppModule } from './app.module';
import { env } from './env.validations';

mongoose.set('debug', env.NODE_ENV === 'production' ? false : true);

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['debug', 'error', 'log', 'verbose', 'warn'],
  });

  app.enableCors();

  app.use(helmet());
  app.use(expressRateLimit({ max: 30, windowMs: 1000 * 60 }));
  app.use(compression());

  app.useGlobalPipes(
    new ValidationPipe({
      disableErrorMessages: env.NODE_ENV === 'production' ? true : false,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );

  app.enable('trust proxy');
  app.enableShutdownHooks();

  await app.listen(env.PORT);
};

bootstrap();
