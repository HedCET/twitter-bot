import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import * as cookieSession from 'cookie-session';
import * as cookieParser from 'cookie-parser';
import * as csurf from 'csurf';
import * as expressRateLimit from 'express-rate-limit';
import * as helmet from 'helmet';

import { AllExceptionsFilter } from './all.exceptions.filter';
import { AppModule } from './app.module';

import { env } from './env.validations';

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();

  app.use(helmet());
  app.set('trust proxy', 1);
  app.use(
    cookieSession({
      name: 'session',
      secret: env.SECRET,
    }),
  );
  app.use(cookieParser());
  app.use(csurf({ cookie: true }));
  // app.use((req, res, next) => {
  //   const _csurf = csurf({ cookie: true });
  //   if (-1 < ['/update'].indexOf(req.url)) return next();
  //   _csurf(req, res, next);
  // });
  app.use(
    expressRateLimit({
      max: 60 * 60,
      windowMs: 1000 * 60 * 60,
    }),
  );
  app.use(compression());

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      disableErrorMessages: env.ENV === 'development' ? false : true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );

  app.enableShutdownHooks();

  await app.listen(env.PORT);
};

bootstrap();
