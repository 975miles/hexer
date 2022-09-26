const { Client, Intents } = require('discord.js');
const bot = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS] });
const db = require('./models');
const cfg = require('./cfg');
const defaultPrefix = '!';
const adminPermission = 'MANAGE_GUILD';
const isAdmin = member => member.hasPermission(adminPermission);
const maxRoleNameLength = 100;

function checkGuild(guild) {
    return new Promise(async () => {
        if (await db.Prefix.findOne({where: {guild: guild.id}}) == null) //if this guild doesn't have a prefix set,
            db.Prefix.create({ //set its prefix to the default one.
                guild: guild.id,
                prefix: defaultPrefix,
            });

        guild.roles.fetch()
            .then(() => {
                guild.members.fetch()
                    .then(members => members.each(member => checkMember(member)));
            });
    });
}

function checkMember(member) {
    return new Promise(async (res, rej) => { //for each member of the guild
        if (member.user.bot) return; //ignore this user if it's a bot
        let roleFound = await db.Role.findOne({where: {guild: member.guild.id, user: member.id}});
        if (roleFound == null) { //if this user doesn't have a colour role,
            member.guild.roles.create({ //create a new role in the guild
                data: {
                    name: `${member.user.username}'s hexer role`,
                    permissions: 0
                },
                reason: `colour role for ${member.user.username}`
            })
                .then(async role => {
                    member.roles.add(role); //give this new role to the member
                    if (db.Role.count({where: {
                        user: member.id,
                        guild: member.guild.id
                    }}) > 0)
                        db.role.destroy({where: {
                            user: member.id,
                            guild: member.guild.id
                        }});
                    res(await db.Role.create({ //store this role in the database
                        role: role.id,
                        user: member.id,
                        guild: member.guild.id
                    }));
                })
                .catch(e => res(null));
        } else
            member.guild.roles.fetch(roleFound.role)
                .then(async role => {
                    if (role == null) {
                        await db.Role.destroy({where: {guild: member.guild.id, user: member.id}});
                        res(await (checkMember(member)));
                    } else {
                        res(roleFound);
                        if (!member.roles.cache.some(roleChecking => roleChecking.id == roleFound.role))
                            member.roles.add(role);
                    }
                });
    });
}

bot.on('ready', () => {
    console.log('Connected to Discord!');
    bot.guilds.cache.each(guild => checkGuild(guild)); //check every guild this bot is in
});

bot.on('guildMemberAdd', member => checkMember(member));
bot.on('guildCreate', guild => checkGuild(guild))

bot.on('messageCreate', async msg => {
    if (!msg.inGuild() || msg.author.bot) return; //ignore this message if it isn't sent in a text channel of a server or if it's sent by a bot user

    let prefix = (await db.Prefix.findOne({where: {guild: msg.guild.id}})).prefix;
    if (msg.content.startsWith(prefix)) {
        let args = msg.content.slice(prefix.length).split(' ');
        let command = args.shift();

        switch (command) {
            case 'help':
                msg.channel.send(`
__hexer__
With this bot in a server, everyone gets their own role which they can customise the name and colour of.
Since the role limit for discord servers is 250, you should only use this bot in small servers.
Colour picker: https://www.google.com/search?q=color+picker
\`\`\`
${prefix}help - this
${prefix}editrole [hex code] [role name] - edit your hexer role
${prefix}setprefix [new prefix] - sets the bot's prefix for this server
${prefix}forceresetrole - forces a reset of your hexer role if the bot just doesnt seem to be working
${prefix}clearunusedroles - deletes the hexer roles for all users who've left the server
\`\`\`
                `);
                break;

            case 'editrole':
                if (args[0]) {
                    if (/^#[0-9A-F]{6}$/i.test(args[0])) {
                        if (args[0] == '#000000')
                            args[0] = '#000001';
                        let userRole = await checkMember(msg.member);
                        if (userRole == null)
                            return msg.reply('Could not create your role. Do I have the "Manage Roles" permission?');
                        //let userRole = await db.Role.findOne({where: {guild: msg.guild.id, user: msg.member.id}});
                        msg.guild.roles.fetch(userRole.role)
                            .then(role => {
                                let roleName = `${args.slice(1).join(' ')} ⎔`;
                                if (roleName.length > maxRoleNameLength)
                                    msg.reply(`That's too long! \`${maxRoleNameLength}\` is the maximum length for a discord role's name.`);
                                else
                                    role.edit({
                                        color: args[0],
                                        name: roleName
                                    })
                                        .then(() => msg.reply(':+1:'))
                                        .catch(e => msg.reply('Could not edit your role. Is it above mine?'));
                            })
                                .catch(e => msg.reply('Could not find your role. Try !forceresetrole first.'));
                    } else msg.reply(`Your first argument (\`${args[0]}\`) was not a hex code.`);
                } else msg.reply(`Usage: \`${prefix}editrole [hex code] [role name]\``);
                break;

            case 'setprefix':
                if (isAdmin(msg.member)) {
                    if (args[0]) {
                        await db.Prefix.update({prefix: args.join(' ')}, {where: {guild: msg.guild.id}});
                        msg.reply('Done!');
                    } else
                        msg.reply(`Usage: \`${prefix}setprefix [new prefix]\``);
                } else
                    msg.reply(`You need the ${adminPermission} permission to set the bot's prefix!`);
                break;
            
            case 'forceresetrole':
                let userRole = await db.Role.findOne({where: {guild: msg.guild.id, user: msg.member.id}});
                if (userRole != null)
                    msg.guild.roles.fetch(userRole.role).then(role => role.delete());
                await db.Role.destroy({where: {guild: msg.guild.id, user: msg.member.id}});
                checkMember(msg.member);
                msg.reply('Attempted hexer role reset.');
                break;

            case 'clearunusedroles':
                if (isAdmin(msg.member)) {
                    msg.guild.roles.fetch() //fetch the guild's roles
                        .then(roles => roles.cache.each(async role => { //for every role in the guild
                            let roleInfo = await db.Role.findOne({where: {role: role.id}});
                            if (roleInfo != null) { //if this role is a hexer role
                                if (!role.members.some(member => member.user.id == roleInfo.user)) {
                                    db.Role.destroy({where: {role: role.id}});
                                    role.delete();
                                }
                            }
                        }))
                        .then(() => msg.reply('Attempted to clear roles of users who\'ve left.'));
                } else
                    msg.reply(`You need the ${adminPermission} permission to clear unused roles!`);
                break;

            
            case 'ping':
                msg.channel.send('yep, i\'m here');
                break;
        }
    } 
});

bot.login(cfg.token);