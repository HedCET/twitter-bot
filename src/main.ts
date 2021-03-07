import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import expressRateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { env } from './env.validations';

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      env.NODE_ENV === 'production'
        ? ['error']
        : ['debug', 'error', 'log', 'verbose', 'warn'],
  });

  app.enableCors();

  app.use(helmet());
  app.use(expressRateLimit({ max: 60, windowMs: 1000 * 60 * 5 }));
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
