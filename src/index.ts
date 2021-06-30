import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

type EqbClientOptions = Partial<{
  saveAccessTokenToLocalStorage: boolean;
  accessTokenHeaderKey: string;
  loggerOnError: Function | null;
  loggerOnInfo: Function | null;
}>;

type ResponseResult = AxiosResponse<any> & { result: boolean };

export const eqbGenerateClient = (
  requestLocation: string,
  options?: EqbClientOptions
) => {
  const accessTokenHeader = options?.accessTokenHeaderKey || "x-access-token";
  const logger = {
    error: (...args: any[]) => {
      if (options?.loggerOnError === null) {
        return;
      } else if (options?.loggerOnError === undefined) {
        console.error(...args);
      } else {
        options.loggerOnError(...args);
      }
    },
    info: (...args: any[]) => {
      if (options?.loggerOnInfo === null) {
        return;
      } else if (options?.loggerOnInfo === undefined) {
        console.info(...args);
      } else {
        options.loggerOnInfo(...args);
      }
    },
  };

  const baseClient = axios.create({
    baseURL: requestLocation,
    headers: {
      "Access-Control-Expose-Headers": accessTokenHeader,
    },
  });

  // It renews access token
  async function renewAccessToken(): Promise<{ result: boolean }> {
    const refreshToken = localStorage.getItem("refresh-token");
    if (!refreshToken) {
      return { result: false };
    }
    return baseClient
      .post("auth/resign", { token: refreshToken })
      .then((res) => {
        baseClient.defaults.headers.common[accessTokenHeader] =
          res.data.data.token;

        if (options?.saveAccessTokenToLocalStorage) {
          localStorage.setItem("access-token", res.data.data.token);
        } else {
          sessionStorage.setItem("access-token", res.data.data.token);
        }

        return { result: true };
      })
      .catch((err) => {
        logger.error(err.response.data);
        return { result: false };
      });
  }

  async function resolver(config: AxiosRequestConfig): Promise<ResponseResult> {
    return baseClient
      .request(config)
      .then((result) => {
        return { ...result.data, result: result.data.result };
      })
      .catch(async (result) => {
        if (result.response) {
          // Request has been resolved with code 400 ~ 500
          logger.error(
            `Error ${result.response.data.status} : ${result.response.data.message}`
          );
          if (result.response.data.code === "TOKEN_EXPIRED") {
            logger.info("Retrying Login...");
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
          logger.error("Error", result.message);
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
        method: "get",
      }),
    delete: (
      url: string,
      config?: AxiosRequestConfig
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, method: "delete" }),
    head: (url: string, config?: AxiosRequestConfig): Promise<ResponseResult> =>
      resolver({ ...config, url, method: "head" }),
    options: (
      url: string,
      config?: AxiosRequestConfig
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, method: "options" }),
    post: (
      url: string,
      data: any,
      config?: AxiosRequestConfig
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, data, method: "post" }),
    put: (
      url: string,
      data: any,
      config?: AxiosRequestConfig
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, data, method: "put" }),
    patch: (
      url: string,
      data: any,
      config?: AxiosRequestConfig
    ): Promise<ResponseResult> =>
      resolver({ ...config, url, data, method: "patch" }),
  };

  return { baseClient, ...eqbClient, resolver };
};

export default eqbGenerateClient;
