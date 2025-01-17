import { HttpOptions, HttpResponse } from '@coolio/http';
import isNil from 'lodash/isNil';
import { resolveRelationships } from './jsonApi.common';
import { FilterOperator, RawResponse, SortOrder } from './jsonApi.interface';
import { JsonResponse } from './jsonApi.response';

const DEFAULT_RESOURCE_LIMIT = 10;

interface Options {
  sort?: boolean;
  pagination?: boolean;
}

export abstract class RequestBuilder<ResponseType> {
  public uri: string;
  protected resolveIncludedRelationships = false;
  protected queryParams: Record<string, string> = {};
  protected sortParams: string[] = [];
  protected limit = DEFAULT_RESOURCE_LIMIT;
  protected offset: undefined | number;
  protected page = 1;

  protected constructor(uri: string, protected options: Options) {
    let params;
    [this.uri, params] = uri.split('?');
    if (params) {
      params.split('&').forEach(param => {
        const [key, value] = param.split('=');
        switch (key) {
          case'sort':
            this.sortParams.push(...value.split(','));
            break;
          case 'page[number]':
            this.page = parseInt(value, 10);
            break;
          case 'page[limit]':
            this.limit = parseInt(value, 10);
            break;
          case 'page[offset]':
            this.offset = parseInt(value, 10);
            break;
          default:
            this.queryParams[key] = decodeURIComponent(value);
            break;
        }
      });
    }
  }

  public get parameters(): Record<string, string> {
    const params = { ...this.queryParams };
    if (this.options.sort && this.sortParams.length) {
      params.sort = this.sortParams.join(',');
    }
    if (this.options.pagination) {
      params['page[limit]'] = this.limit.toString();

      if (isNil(this.offset)) {
        params['page[number]'] = this.page.toString();
      } else {
        params['page[offset]'] = (this.offset * this.limit).toString(); // @TODO: currently not supported by API
      }
    }
    return params;
  }

  public abstract send(options?: HttpOptions): Promise<ResponseType>;

  public resolveIncluded(resolveIncluded?: boolean): this {
    this.resolveIncludedRelationships = resolveIncluded === undefined ? true : resolveIncluded;
    return this;
  }

  public parameter(
    key: string,
    value: string | number | boolean | undefined,
  ): this {
    if (key && !isNil(value)) {
      this.queryParams[key] = value.toString();
    }
    return this;
  }

  public filter(
    key: string | string[] | undefined,
    value: string | number | boolean | undefined,
    operator?: FilterOperator,
  ): this {
    const queryKey = Array.isArray(key)
      ? (key.length ? `filter[${key.join('][')}]` : '')
      : `filter[${key}]${operator ? `[${operator}]` : ''}`;
    return this.parameter(queryKey, value);
  }

  public sort(key: string | undefined, order: SortOrder): this {
    if (!isNil(key)) {
      this.sortParams.push(order + key);
    }
    return this;
  }

  public pageLimit(limit: number): this {
    this.limit = limit;
    return this;
  }

  public pageOffset(offset: number): this {
    this.offset = offset;
    return this;
  }

  public pageNumber(page: number | string | undefined): this {
    this.page = page ? Number(page) : 1;
    return this;
  }

  protected async parseResponse<Raw extends RawResponse<any, any>>(response: HttpResponse): Promise<JsonResponse<Raw>> {
    const body = (await response.parsedBody()) || undefined;
    if (body) {
      let responseData = body.data;

      if (this.resolveIncludedRelationships && body.included) {
        responseData = resolveRelationships(responseData, body.included);
      }

      body.data = responseData;
    }
    return new JsonResponse(body, response);
  }
}
