import neo4j from 'neo4j-driver';

export const dbProviders = [
  {
    provide: 'NEO4J',
    useFactory: async () => {
      const driver = neo4j.driver(
        'bolt://localhost:7687',
        neo4j.auth.basic('neo4j', 'password'),
      );
      await driver.verifyConnectivity();
      return driver;
    },
  },
];
