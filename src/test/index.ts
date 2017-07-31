import test from 'ava';
import * as Sequelize from 'sequelize';
import DbResource, * as Db from '../lib';
import * as Corrieneuch from 'corrieneuch';
import * as fs from 'fs';

const config = require('rc-yaml')('corrieneuchsequelize');

let db: Sequelize.Sequelize;

interface User {
  name: string;
  email: string;
  groupId?: number;
}

interface Group {
  name: string;
}

interface Post {
  title: string;
  authorId: number;
}

test.before(async (t) => {
  db = new Sequelize(config.connectionString);
  await db.query('CREATE SCHEMA sequelizesuperapi');
});

test.after.always(async (t) => {
  await db.query('DROP SCHEMA sequelizesuperapi CASCADE');
});

function tbl(name) {
  return name + Math.round(Math.random() * 1e6);
}

async function defineGroup() {
  let Group = await db.define<Sequelize.Instance<Group>, Group>(tbl('groups'), {
    name: Sequelize.STRING
  });

  await Group.sync();
  return Group;
}


async function defineUser(Group: Db.EntityModel<Group> = null) {
  let User = await db.define<Sequelize.Instance<User>, User>(tbl('users'), {
    name: Sequelize.STRING,
    email: Sequelize.STRING,
    groupId: Sequelize.INTEGER
  });

  if (Group) {
    User.belongsTo(Group, {foreignKey: 'groupId', as: 'group'});
  }

  await User.sync();
  return User;
}


async function definePost(User: Db.EntityModel<User>) {
  let Post = await db.define<Sequelize.Instance<Post>, Post>(tbl('posts'), {
    title: Sequelize.STRING
  });

  Post.belongsTo(User, {foreignKey: 'authorId', as: 'author'});
  await Post.sync();
  return Post;
}


test('list', async (t) => {
  let User = await defineUser();

  await User.bulkCreate([
    {name: 'Fred Flintstone', email: 'fred@gmail.com'},
    {name: 'Wilma Flintstone', email: 'wilma@gmail.com'}
  ]);

  let resource = new DbResource(User);
  let result = await resource.list('/users', new Corrieneuch.QueryOptions({}));

  t.is(result.elements.length, 2);
  t.is(result.elements[0].attributes.name, 'Fred Flintstone');
  t.regex(result.elements[0].links.$self, /^\/users\/[0-9]+$/);
  t.is(result.elements[1].attributes.name, 'Wilma Flintstone');
  t.regex(result.elements[1].links.$self, /^\/users\/[0-9]+$/);
});


test('list constraint', async (t) => {
  let User = await defineUser();

  await User.bulkCreate([
    {name: 'Fred Flintstone', email: 'fred@gmail.com', groupId: 1},
    {name: 'Wilma Flintstone', email: 'wilma@gmail.com', groupId: 2}
  ]);

  let resource = new DbResource(User);
  let result = await resource.list('/users', new Corrieneuch.QueryOptions({}), {groupId: 1});

  t.is(result.elements.length, 1);
  t.is(result.elements[0].attributes.name, 'Fred Flintstone');
  t.regex(result.elements[0].links.$self, /^\/users\/[0-9]+$/);
});


test('list fields', async (t) => {
  let User = await defineUser();

  await User.bulkCreate([
    {name: 'Fred Flintstone', email: 'fred@gmail.com'},
    {name: 'Wilma Flintstone', email: 'wilma@gmail.com'}
  ]);

  let resource = new DbResource(User);
  let result = await resource.list('/users', new Corrieneuch.QueryOptions({fields: {$self: 'email'}}));
  t.is(result.elements.length, 2);
  t.falsy(result.elements[0].attributes.name);
  t.falsy(result.elements[1].attributes.name);
});


test('list sort', async (t) => {
  let User = await defineUser();

  await User.bulkCreate([
    {name: 'Fred Flintstone', email: 'fred@gmail.com'},
    {name: 'Wilma Flintstone', email: 'wilma@gmail.com'}
  ]);

  let resource = new DbResource(User);
  let result = await resource.list('/users', new Corrieneuch.QueryOptions({sort: '-name'}));

  t.is(result.elements.length, 2);
  t.is(result.elements[0].attributes.name, 'Wilma Flintstone');
  t.is(result.elements[1].attributes.name, 'Fred Flintstone');
});


test('list filter', async (t) => {
  let User = await defineUser();

  await User.bulkCreate([
    {name: 'Fred Flintstone', email: 'fred@gmail.com'},
    {name: 'Wilma Flintstone', email: 'wilma@gmail.com'}
  ]);

  let resource = new DbResource(User);
  let result = await resource.list('/users', new Corrieneuch.QueryOptions({filter: {name: 'Wilma Flintstone'}}));

  t.is(result.elements.length, 1);
  t.is(result.elements[0].attributes.name, 'Wilma Flintstone');
});


test('list filter constraint', async (t) => {
  let User = await defineUser();

  await User.bulkCreate([
    {name: 'Fred Flintstone', email: 'fred@gmail.com'},
    {name: 'Wilma Flintstone', email: 'wilma@gmail.com'}
  ]);

  let resource = new DbResource(User);
  let result = await resource.list('/users', new Corrieneuch.QueryOptions({filter: {name: {$like: 'wilma%'}}}), {groupId: 2});

  t.is(result.elements.length, 0);
});


test('list include', async (t) => {
  let User = await defineUser();
  let fred = await User.create({name: 'Fred Flintstone', email: 'fred@gmail.com'});

  let Post = await definePost(User);
  await Post.create({title: 'Hello, world', authorId: fred.get('id')});

  let resource = new DbResource(Post, {
    author: {
      relationship: {model: User, as: 'author'},
      link: '/users/<%=authorId%>'
    }
  });

  let result = await resource.list('/users', new Corrieneuch.QueryOptions({include: 'author'}));

  t.is(result.elements.length, 1);
  t.falsy(result.elements[0].attributes.author);
  t.is(result.includes.length, 1);
  t.is(result.includes[0].links.$self, '/users/' + fred.get('id'));
  t.is(result.includes[0].attributes.name, 'Fred Flintstone');
});


test('list include outer', async (t) => {
  let Group = await defineGroup();
  let User = await defineUser(Group);

  let group = await Group.create({name: 'group 1'});
  let user1 = await User.create({name: 'Fred Flintstone', email: 'fred@gmail.com', groupId: group.get('id')});
  let user2 = await User.create({name: 'Wilma Flintstone', email: 'wilma@gmail.com'});

  let resource = new DbResource(User, {
    group: {
      relationship: {model: Group, as: 'group'},
      link: '/groups/<%=groupId%>'
    }
  });

  let result = await resource.list('/users', new Corrieneuch.QueryOptions({include: 'group'}));

  t.is(result.elements.length, 2);
  
  let fred = result.elements.filter((x) => x.attributes.email === 'fred@gmail.com')[0];
  t.is(fred.links.group, `/groups/${group.get('id')}`);

  let fredGroup = result.includes.filter((x) => x.links.$self === fred.links.group)[0];
  t.is(fredGroup.attributes.name, 'group 1');
  
  let wilma = result.elements.filter((x) => x.attributes.email === 'wilma@gmail.com')[0];
  t.falsy(wilma.links.group);
});


test('get', async (t) => {
  let User = await defineUser();
  let fred = await User.create({name: 'Fred Flintstone', email: 'fred@gmail.com'});

  let resource = new DbResource(User);
  let result = await resource.get('/users/1', fred.get('id'), new Corrieneuch.QueryOptions({}));

  t.is(result.attributes.id, fred.get('id'));
  t.is(result.attributes.name, 'Fred Flintstone');
  t.is(result.attributes.email, 'fred@gmail.com');
});


test('get constraint', async (t) => {
  let User = await defineUser();
  let fred = await User.create({name: 'Fred Flintstone', email: 'fred@gmail.com', groupId: 1});

  let resource = new DbResource(User);
  let result = await resource.get('/users/1', fred.get('id'), new Corrieneuch.QueryOptions({}), {groupId: 1});

  t.is(result.attributes.id, fred.get('id'));
  t.is(result.attributes.name, 'Fred Flintstone');
  t.is(result.attributes.email, 'fred@gmail.com');
});


test('get constraint missing', async (t) => {
  let User = await defineUser();
  let fred = await User.create({name: 'Fred Flintstone', email: 'fred@gmail.com', groupId: 1});

  let resource = new DbResource(User);
  let result = await resource.get('/users/1', fred.get('id'), new Corrieneuch.QueryOptions({}), {groupId: 2});

  t.is(result, null);
});


test('get fields', async (t) => {
  let User = await defineUser();
  let fred = await User.create({name: 'Fred Flintstone', email: 'fred@gmail.com'});

  let resource = new DbResource(User);
  let result = await resource.get('/users/1', fred.get('id'), new Corrieneuch.QueryOptions({fields: {$self: 'name'}}));

  t.is(result.attributes.id, fred.get('id'));
  t.is(result.attributes.name, 'Fred Flintstone');
  t.falsy(result.attributes.email);
});


test('get include', async (t) => {
  let User = await defineUser();
  let fred = await User.create({name: 'Fred Flintstone', email: 'fred@gmail.com'});

  let Post = await definePost(User);
  let post = await Post.create({title: 'Hello, world', authorId: fred.get('id')});

  let resource = new DbResource(Post, {
    author: {
      relationship: {model: User, as: 'author'},
      link: '/users/<%=authorId%>'
    }
  });

  let result = await resource.get('/users/1', fred.get('id'), new Corrieneuch.QueryOptions({include: 'author'}));

  t.is(result.attributes.id, post.get('id'));
  t.is(result.attributes.title, 'Hello, world');
  t.is(result.includes.length, 1);
  t.is(result.includes[0].links.$self, '/users/' + fred.get('id'));
  t.is(result.includes[0].attributes.name, 'Fred Flintstone');
});


test('get missing', async (t) => {
  let User = await defineUser();
  let resource = new DbResource(User);
  let result = await resource.get('/users/1', 5, new Corrieneuch.QueryOptions({}));

  t.is(result, null);
});


test('create', async (t) => {
  let User = await defineUser();
  let resource = new DbResource(User);

  let result = await resource.create('/users/1', {attributes: {
    name: 'Fred Flintstone',
    email: 'fred@gmail.com'
  }});

  let users = await User.findAll();
  t.is(users.length, 1);
  t.is(users[0].get('name'), 'Fred Flintstone');
});


test('create constraint pass', async (t) => {
  let User = await defineUser();
  let resource = new DbResource(User);

  let result = await resource.create('/users/1', {attributes: {
    name: 'Fred Flintstone',
    email: 'fred@gmail.com',
    groupId: 2
  }}, {groupId: 2});

  let users = await User.findAll();
  t.is(users.length, 1);
  t.is(users[0].get('name'), 'Fred Flintstone');
  t.is(users[0].get('groupId'), 2);
});


test('create constraint fail', async (t) => {
  let User = await defineUser();
  let resource = new DbResource(User);

  await t.throws(resource.create('/users/1', {attributes: {
    name: 'Fred Flintstone',
    email: 'fred@gmail.com',
    groupId: 1
  }}, {groupId: 2}));
});


test('update', async (t) => {
  let User = await defineUser();
  let wilma = await User.create({name: 'Wilma Flintstone', email: 'wilma@gmail.com'});

  let resource = new DbResource(User);

  let result = await resource.update('/users/1', 1, {attributes: {
    name: 'Wilma Rubble' // poor Fred
  }});

  let updated = await User.findById(wilma.get('id'));
  t.is(updated.get('name'), 'Wilma Rubble');
  t.is(updated.get('email'), 'wilma@gmail.com');
});


test('update constraint pass', async (t) => {
  let User = await defineUser();
  let wilma = await User.create({name: 'Wilma Flintstone', email: 'wilma@gmail.com', groupId: 1});

  let resource = new DbResource(User);

  let result = await resource.update('/users/1', 1, {attributes: {
    name: 'Wilma Rubble',
    groupId: 1
  }}, {groupId: 1});

  let updated = await User.findById(wilma.get('id'));
  t.is(updated.get('name'), 'Wilma Rubble');
  t.is(updated.get('email'), 'wilma@gmail.com');
});


test('update constraint missing', async (t) => {
  let User = await defineUser();
  let wilma = await User.create({name: 'Wilma Flintstone', email: 'wilma@gmail.com', groupId: 1});

  let resource = new DbResource(User);

  let result = await resource.update('/users/1', 1, {attributes: {
    name: 'Wilma Rubble',
    groupId: 2
  }}, {groupId: 2});

  let updated = await User.findById(wilma.get('id'));

  t.is(result, null);
});


test('update constraint violation', async (t) => {
  let User = await defineUser();
  let wilma = await User.create({name: 'Wilma Flintstone', email: 'wilma@gmail.com', groupId: 1});

  let resource = new DbResource(User);

  await t.throws(resource.update('/users/1', 1, {attributes: {
    name: 'Wilma Rubble',
    groupId: 2
  }}, {groupId: 1}));

  let updated = await User.findById(wilma.get('id'));
  t.deepEqual(updated.get(), wilma.get());
});


test('update missing', async (t) => {
  let User = await defineUser();
  let resource = new DbResource(User);

  let result = await resource.update('/users/1', 1, {attributes: {
    name: 'Wilma Rubble'
  }});

  t.is(result, null);
});



test('delete', async (t) => {
  let User = await defineUser();
  let wilma = await User.create({name: 'Wilma Flintstone', email: 'wilma@gmail.com'});

  let resource = new DbResource(User);
  let result = await resource.delete(1);

  let user = await User.findById(wilma.get('id'));
  t.is(user, null);
});


test('delete constraint', async (t) => {
  let User = await defineUser();
  let wilma = await User.create({name: 'Wilma Flintstone', email: 'wilma@gmail.com', groupId: 1});

  let resource = new DbResource(User);
  let result = await resource.delete(1, {groupId: 1});

  let user = await User.findById(wilma.get('id'));
  t.is(user, null);
});


test('delete constraint missing', async (t) => {
  let User = await defineUser();
  let wilma = await User.create({name: 'Wilma Flintstone', email: 'wilma@gmail.com', groupId: 1});

  let resource = new DbResource(User);
  let result = await resource.delete(1, {groupId: 2});

  let user = await User.findById(wilma.get('id'));
  t.not(user, null);
});
