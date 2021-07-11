import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

type EqbClientOptions = Partial<{
  saveAccessTokenToLocalStorage: boolean;
  accessTokenResolver: { get: () => string; set: (value: string) => void };
  refreshTokenResolver: { get: () => string; set: (value: string) => void };
  accessTokenHeaderKey: string;
  loggerOnError: Function | null;
  loggerOnInfo: Function | null;
  tokenResignEndpiont: string;
}> & {
  onTokenResignFail: () => void;
};

type ResponseResult = AxiosResponse<any> & { result: boolean };

const resolveLogger = (
  option: Function | null | undefined,
  loggerLevel: Function,
): Function => {
  if (option === null) {
    return () => {};
  } else if (option === undefined) {
    return loggerLevel;
  } else {
    return option;
  }
};

export const eqbGenerateClient = (
  requestLocation: string,
  options: EqbClientOptions,
) => {
  const logger = {
    error: (...args: any[]) =>
      resolveLogger(options?.loggerOnError, console.error)(...args),
    info: (...args: any[]) =>
      resolveLogger(options?.loggerOnInfo, console.info)(...args),
  };

  const accessTokenHeader = options?.accessTokenHeaderKey || 'x-access-token';

  const accessTokenResolver = {
    get:
      options?.accessTokenResolver?.get ||
      (() => localStorage.getItem('access-token')),
    set:
      options?.accessTokenResolver?.set ||
      ((value: string) => localStorage.setItem('access-token', value)),
  };

  const refreshTokenResolver = {
    get:
      options?.refreshTokenResolver?.get ||
      (() => localStorage.getItem('refresh-token')),
    set:
      options?.refreshTokenResolver?.set ||
      ((value: string) => localStorage.setItem('refresh-token', value)),
  };

  const resignEndpoint = options?.tokenResignEndpiont || '/auth/resign';

  const baseClient = axios.create({
    baseURL: requestLocation,
    headers: {
      'Access-Control-Expose-Headers': accessTokenHeader,
    },
  });

  // It renews access token
  async function renewAccessToken(): Promise<{ result: boolean }> {
    const refreshToken = refreshTokenResolver.get();
    if (!refreshToken) {
      return { result: false };
    }
    return baseClient
      .post(resignEndpoint, { token: refreshToken })
      .then((res) => {
        // baseClient.defaults.headers.common[accessTokenHeader] =
        //   res.data.data;
        accessTokenResolver.set(res.data.data);

        return { result: true };
      })
      .catch((err) => {
        logger.error(err.response.data);
        options.onTokenResignFail();
        return { result: false };
      });
  }

  async function resolver(config: AxiosRequestConfig): Promise<ResponseResult> {
    return baseClient
      .request({
        ...config,
        headers: {
          ...config.headers,
          [accessTokenHeader]: accessTokenResolver.get(),
        },
      })
      .then((result) => {
        return { ...result.data, result: result.data.result };
      })
      .catch(async (result) => {
        if (result.response) {
          // Request has been resolved with code 400 ~ 500
          logger.error(
            `Error ${result.response.data.status} : ${result.response.data.message}`,
          );
          if (result.response.data.code === 'TOKEN_EXPIRED') {
            logger.info('Retrying Login...');
            if (!(await renewAccessToken()).result) {
              return { ...result };
            } else {
              return await resolver(config);
            }
          }
        } else if (result.request) {
          // Request failed
          logger.error(result.request);
        } else {
          // Error on request processing
          logger.error('Error', result.message);
        }
      });
  }

  // Translate methods to config JSON
  const eqbClient = {
    request: (config: AxiosRequestConfig): Promise<ResponseResult> =>
      resolver(config),
    get: (url: string, config?: AxiosRequestConfig): Promise<ResponseResult> =>
      resolver({
        ...config,
        url,
        method: 'get',
      }),
    delete: (
      url: string,
      config?: AxiosRequestConfig,
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, method: 'delete' }),
    head: (url: string, config?: AxiosRequestConfig): Promise<ResponseResult> =>
      resolver({ ...config, url, method: 'head' }),
    options: (
      url: string,
      config?: AxiosRequestConfig,
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, method: 'options' }),
    post: (
      url: string,
      data: any,
      config?: AxiosRequestConfig,
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, data, method: 'post' }),
    put: (
      url: string,
      data: any,
      config?: AxiosRequestConfig,
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, data, method: 'put' }),
    patch: (
      url: string,
      data: any,
      config?: AxiosRequestConfig,
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, data, method: 'patch' }),
  };

  return { baseClient, ...eqbClient, resolver };
};

export default eqbGenerateClient;
