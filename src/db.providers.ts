import neo4j from 'neo4j-driver';

import { env } from './env.validations';

export const dbProviders = [
  {
    provide: 'NEO4J',
    useFactory: async () => {
      const url = new URL(env.NEO4J_URL);

      const driver = neo4j.driver(
        `${url.protocol}//${url.host}`,
        neo4j.auth.basic(
          decodeURIComponent(url.username),
          decodeURIComponent(url.password),
        ),
      );

      // verify connectivity
      await driver.verifyConnectivity();

      return driver;
    },
  },
];
