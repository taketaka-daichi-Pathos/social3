import { FirebaseOptions } from 'firebase/app';

export interface Environment {
  production: boolean;
  firebase: FirebaseOptions;
}
