import type { APIGatewayProxyHandler } from 'aws-lambda';
import { createAwsDependencies } from './aws.js';
import { routeControlRequest } from './router.js';
import { createServices } from './services.js';

let services: ReturnType<typeof createServices> | undefined;
const getServices = () => (services ??= createServices(createAwsDependencies()));

export const handler: APIGatewayProxyHandler = async (event) =>
  routeControlRequest(event, getServices());
