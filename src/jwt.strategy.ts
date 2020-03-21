import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { env } from './env.validations';
import { db } from './firebase';
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
    const accountRef = db.ref(`accounts/${payload._id}`);
    const accountRefVal = (await accountRef.once('value')).val();

    if (accountRefVal && !accountRefVal.blocked)
      return { ...payload, roles: accountRefVal.roles };

    throw new UnauthorizedException();
  }
}
