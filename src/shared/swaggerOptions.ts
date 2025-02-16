const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Shattered Archive Api',
        version: '1.0.0',
        description: 'API Documentation for My Express App',
      },
    },
    apis: ['**/routes/**/*.ts'],
  };
  export default swaggerOptions;