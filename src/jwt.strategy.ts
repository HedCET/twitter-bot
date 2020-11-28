import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { env } from './env.validations';
import { jwtPayload } from './jwt.payload.interface';
import { User, UserDocument } from './users.table';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.SECRET,
    });
  }

  async validate(payload: jwtPayload) {
    const user = await this.userModel.findOne(
      { _id: payload._id },
      { _id: 1, roles: 1 },
    );

    if (user) return user;
    throw new UnauthorizedException();
  }
}
