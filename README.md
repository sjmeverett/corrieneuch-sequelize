# corrieneuch-sequelize

Provides [Corrieneuch](https://www.npmjs.com/package/corrieneuch) actions using a Sequelize connection.  Only tested with Postres so far.

## Installation

    $ npm install --save corrieneuch-sequelize

## Usage

```js
import * as Corrieneuch from 'corrieneuch';
import DbResourceCollection from 'corrieneuch-sequelize';

let users = new DbResourceCollection(User);

// inside a request handler
users.get('/users/1', 1, new Corrieneuch.QueryOptions(request.query));
```

## Documentation

#### `constructor(model: EntityModel<TEntity>, relationships: _.Dictionary<EntityRelationship> = {})`

Constructor.  Pass a Sequelize Model in as the first parameter, which will connect the resource collection
to a table in the database.

If you want to support the `include` query option with related resources, use
the `relationships` field.  E.g., for the canonical blog posts with `User` entities as authors:

```js
let posts = new DbResource(Post, {
  author: {
    relationship: {model: User, as: 'author'},
    link: '/users/<%=authorId%>'
  }
});
```

The `link` field specifies the format of the URL.

#### `list(url: string, options: Corrieneuch.QueryOptions, constraints?): Promise<Corrieneuch.Resource>`

Returns a resource with a list of resources as elements.  The `$self` links will be based off
the supplied URL, with subresources having their ID appended.  Currently only `number` paging is
supported.  `offset` paging can also be used, but it must represent a whole number of pages, and
it will be converted to `number` paging.

The `constraints` parameter is useful in multi-tenant scenarios - passing a filter here will contrain
the list to match the filter.

#### `get(url: string, id: any, options: Corrieneuch.QueryOptions, constraints?): Promise<Corrieneuch.Resource>`

Returns a resource with the specified resource as attributes, and the given URL as the `$self` link.
If `constraints` is given, the item will only be returned if it also matches `constraints`.

#### `create(url: string, payload: any, constraints?): Promise<Corrieneuch.Resource>`

Creates and returns a resource from the specified request payload.  The payload must contain an
`attributes` field from which the new resource will be constructed.

If `constraints` is given, the payload must match it or an exception will be thrown.

#### `update(url: string, id: any, payload: any, constraints?): Promise<Corrieneuch.Resource>`

Updates and returns the resource with the specified ID.  Only the fields given in `payload.attributes`
will be updated.  If the given resource isn't found, then `null` is returned.

The payload must match `constraints`, or an exception will be thrown.  Additionally, the existing DB object
must also match `constraints`, or `null` will be returned.

#### `delete(id: any, constraints?): Promise<number>`

Deletes the resource with the specified ID.  A count of the number of rows deleted will be returned.

If `constraints` is given, the object to be deleted must also match it.
