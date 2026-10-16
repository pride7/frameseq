import { BusinessError } from '@kit.BasicServicesKit';
import LogUtil from './LogUtil';

// Window decoration is optional on tablets. An unsupported desktop operation must
// not prevent the host from finishing window initialization.
export class WindowCompatibility {
  static runSync(name: string, operation: () => void): void {
    try {
      operation();
    } catch (error) {
      WindowCompatibility.handle(name, error);
    }
  }

  static runAsync(name: string, operation: () => Promise<void>): void {
    try {
      operation().catch((error: BusinessError) => {
        WindowCompatibility.handle(name, error);
      });
    } catch (error) {
      WindowCompatibility.handle(name, error);
    }
  }

  private static handle(name: string, error: BusinessError): void {
    if (error.code === 801) {
      LogUtil.warn('WindowCompatibility', `${name} is not supported on this device`);
      return;
    }
    throw error as Error;
  }
}
