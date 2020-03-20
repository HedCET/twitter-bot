import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { env } from './env.validations';
import { jwtPayload } from './jwt.payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.SECRET,
    });
  }

  async validate(payload: jwtPayload) {
    const user = { ...payload, roles: ['admin'] }; // user check
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
