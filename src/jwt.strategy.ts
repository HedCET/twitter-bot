import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { env } from './env.validations';
import { jwtPayload } from './jwt.payload.interface';
import { Neo4jService } from './neo4j.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly neo4jService: Neo4jService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.SECRET,
    });
  }

  async validate(payload: jwtPayload) {
    const {
      records: [nPerson],
    } = await this.neo4jService.read(
      `MATCH (p:nPerson {name: $name})
      RETURN p.name, p.roles`,
      {
        name: payload.name,
      },
    );

    if (nPerson)
      return {
        name: nPerson.get('p.name'),
        roles: nPerson.get('p.roles') || [],
      };

    throw new UnauthorizedException();
  }
}
