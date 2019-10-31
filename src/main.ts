import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
// import * as csurf from 'csurf';
import * as expressRateLimit from 'express-rate-limit';
import * as helmet from 'helmet';

import { AllExceptionsFilter } from './all.exceptions.filter';
import { AppModule } from './app.module';
import * as compression from 'compression';
import { env } from './env.validations';

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());
  app.use(
    expressRateLimit({
      max: 60 * 60,
      windowMs: 1000 * 60 * 60,
    }),
  );
  // app.use(csurf());
  app.use(compression());

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({
    disableErrorMessages: (env.ENV == 'development' ? true : false),
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    whitelist: true,
  }));

  app.enableCors();
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}

bootstrap();
