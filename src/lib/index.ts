import * as _ from 'lodash';
import * as Corrieneuch from 'corrieneuch';
import * as Sequelize from 'sequelize';
import * as filtr from 'filtr';

/**
 * Convenience wrapper for `Sequelize.Model`.
 */
export type EntityModel<TEntity> = Sequelize.Model<Sequelize.Instance<TEntity>, TEntity>;

/**
 * Allowable types for `include` option in query options.
 */
export type SequelizeInclude = Sequelize.Model<any, any> | Sequelize.IncludeOptions;

/**
 * Represents a foreign key relationship between entities.
 */
export interface EntityRelationship {
  relationship: SequelizeInclude;
  link: string;
};

/**
 * A collection of SuperApi resources held in a SQL database connected to by Sequelize.
 */
export default class DbResourceCollection<TEntity> {
  /**
   * Constructor.
   * @param model the model representing the collection
   * @param relationships any relationships the resource collection has with other models, to support the `includes` option, optional
   */
  constructor(private model: Sequelize.Model<Sequelize.Instance<TEntity>, TEntity>, private relationships: _.Dictionary<EntityRelationship> = {}) {
  }


  /**
   * Gets a list of resources.
   * @param url the current URL of the request
   * @param options the query options, parsed from the querystring
   */
  async list(url: string, options: Corrieneuch.QueryOptions, filter?: Corrieneuch.FilterSpec): Promise<Corrieneuch.Resource> {
    let page = options.page('number');
    let includeRelationships = _.values(this._getInclude(options, 'relationship'));

    let query: Sequelize.FindOptions<TEntity> = _.pickBy({
      limit: page.size,
      offset: (page.number - 1) * page.size,
      where: translateFilter(options.filter(), filter),
      attributes: options.fieldsFor('$self'),
      order: this._getSortOptions(options),
      include: includeRelationships
    }, (v) => v != null);

    if (query.attributes && (<string[]>query.attributes).indexOf('id') === -1)
      (<string[]>query.attributes).push('id');

    let result = await this.model.findAndCountAll(query);
    let pageCount = Math.ceil(result.count / page.size);

    let elements = result.rows.map(
      (user) => new Corrieneuch.Resource(url + '/<%=id%>', user.get())
    );
    
    let meta: Corrieneuch.ResourceMeta = {
      count: result.count,
      page: {
        number: page.number,
        size: page.size,
        count: pageCount
      }
    };
    
    let resource = new Corrieneuch.Resource(url, elements, meta);
    resource.addLinks(this._getPageLinks(url, options, page.number, pageCount));
    
    if (includeRelationships.length) {
      let includeLinks = this._getInclude(options, 'link');
      resource.elements.forEach((resource) => this._convertFromInstance(resource, includeLinks));
      resource.flatten();
    }

    return resource;
  }


  /**
   * Gets a single resource with the specified ID, or null if it does not exist.
   * @param url the current URL
   * @param id the ID of the resource sought
   * @param options the query options, parsed from the querystring
   */
  async get(url: string, id: any, options: Corrieneuch.QueryOptions, filter?: Corrieneuch.FilterSpec): Promise<Corrieneuch.Resource> {
    let includeRelationships = _.values(this._getInclude(options, 'relationship'));
    
    let query: Sequelize.FindOptions<TEntity> = _.pickBy({
      where: {id, ...filter},
      attributes: options.fieldsFor('$self'),
      include: includeRelationships
    }, (v) => v != null);

    if (query.attributes && (<string[]>query.attributes).indexOf('id') === -1)
      (<string[]>query.attributes).push('id');

    let result = await this.model.findOne(query);
    
    if (!result) {
      return null;

    } else {
      let resource = new Corrieneuch.Resource(url + '/' + id, result.get());
      
      if (includeRelationships.length) {
        let includeLinks = this._getInclude(options, 'link');
        this._convertFromInstance(resource, includeLinks);
        resource.flatten();
      }

      return resource;
    }
  }


  /**
   * Creates a resource.
   * @param url the current URL
   * @param payload the request payload, must contain `attributes`
   */
  async create(url: string, payload: any, constraints?): Promise<Corrieneuch.Resource> {
    if (constraints) {
      const query = filtr(constraints);

      if (!query.test(payload.attributes, {type: 'single'}))
        throw new Error('constraint violation');
    }

    const entity = await this.model.create({...payload.attributes});
    return new Corrieneuch.Resource(url + '/<%=id>', entity.get());
  }


  /**
   * Updates a resource.
   * @param url the current URL
   * @param payload the request payload, must contain `attributes`
   */
  async update(url: string, id: any, payload: any, constraints?: Corrieneuch.FilterSpec): Promise<Corrieneuch.Resource> {
    if (constraints) {
      const query = filtr(constraints);

      if (!query.test(payload.attributes, {type: 'single'}))
        throw new Error('constraint violation');
    }

    let [nrows, results] = <any>await this.model.update(payload.attributes, {
      where: {id, ...constraints},
      returning: true
    });

    if (typeof nrows === 'undefined') {
      nrows = results;
      // TODO: figure out what's wrong with the types here
      results = [await this.model.findOne(<any>{where: {id}})];
    }

    if (nrows === 0) {
      return null;
    } else {
      return new Corrieneuch.Resource(url, results[0].get());
    }
  }


  /**
   * Deletes a resource.
   * @param id the ID of the resource to delete
   */
  async delete(id: any, filter?: Corrieneuch.FilterSpec): Promise<number> {
    return await this.model.destroy({where: {id, ...filter}});
  }

  private _getPageLinks(url: string, options: Corrieneuch.QueryOptions, pageNumber: number, pageCount: number) {
    let links: any = {
      $first: url + options.clone({page: {number: 1}}).toString(),
      $last: url + options.clone({page: {number: pageCount}}).toString()
    };

    if (pageNumber > 1)
      links.$previous = url + options.clone({page: {number: pageNumber - 1}}).toString();

    if (pageNumber < pageCount)
      links.$next = url + options.clone({page: {number: pageNumber + 1}}).toString();

    return links;
  }


  private _getSortOptions(options: Corrieneuch.QueryOptions) {
    let sort = options.sort();

    if (sort) {
      return _.map(sort,
        (direction, key) => [key, direction === 1 ? 'ASC' : 'DESC']
      );

    } else {
      return null;
    }
  }


  private _getInclude(options: Corrieneuch.QueryOptions, field: 'relationship'): _.Dictionary<SequelizeInclude>;
  private _getInclude(options: Corrieneuch.QueryOptions, field: 'link'): _.Dictionary<string>;
  private _getInclude(options: Corrieneuch.QueryOptions, field: string) {
    let include = options.include();

    if (include) {
      let relationships = <_.Dictionary<EntityRelationship>>_.pick(this.relationships, include);
      return _.mapValues(relationships, (v) => v[field]);

    } else {
      return null;
    }
  }


  private _convertFromInstance(resource: Corrieneuch.Resource, includeLinks: _.Dictionary<string>) {
    for (let k in includeLinks) {
      const value = resource.attributes[k];

      if (value == null) {
        continue;

      } else if (Array.isArray(value)) {
        resource.attributes[k] = value.map((v) => v.get());

      } else {
        resource.attributes[k] = value.get();
      }
      
      resource.addLink(k, includeLinks[k]);
    }
  }
};


function translateFilter(filter, extra?) {
  if (!filter)
    return extra;

  if (filter.$and)
    filter.$and = filter.$and.map((filter) => translateFilter(filter));

  if (filter.$or)
    filter.$or = filter.$or.map((filter) => translateFilter(filter));
  
  if (filter.$not)
    filter.$not = translateFilter(filter);
  
  for (let k in filter) {
    const value = filter[k];
    
    if (_.isPlainObject(value)) {
      if (Object.keys(value).length > 1)
        throw new Error(`filter key ${k} query is too complex`);
      
      if (value.$like) {
        filter[k] = Sequelize.where(
          Sequelize.fn('lower', Sequelize.col(k)),
          {$like: value.$like.toLowerCase()}
        );
      }
    }
  }

  if (extra) {
    return {$and: [filter, extra]};

  } else {
    return filter;
  }
}
