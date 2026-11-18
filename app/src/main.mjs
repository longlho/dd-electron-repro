// Stand-in for the xplat main process entry: the SDK and dd-trace are
// externalized by the Datadog Vite plugin and loaded from main/node_modules.
import { init } from '@datadog/electron-sdk';
import tracer from 'dd-trace';

export { init, tracer };
