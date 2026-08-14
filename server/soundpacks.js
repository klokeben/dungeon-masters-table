/* ============================================================
   THE SOUND CATALOG

   Each pad describes what it wants from Freesound. The server
   searches, filters to Creative Commons Zero (no attribution
   burden, no licence tripwires), and hands the browser a
   handful of streamable candidates so the DM can swap any pad
   they don't like.

   `synth` names the built-in synthesized patch used when no
   Freesound key is configured, so the board always makes noise.
   ============================================================ */

export const AMBIENCE_PACK = [
  { key: 'tavern',     label: 'The Common Room',   glyph: '🍺', synth: 'tavern',   desc: 'Crowd, hearth, someone playing badly in the corner', query: 'tavern inn pub crowd ambience medieval' },
  { key: 'town',       label: 'Market & Streets',  glyph: '🏘️', synth: 'town',     desc: 'Daytime bustle, carts, a distant bell',            query: 'medieval market town square crowd ambience' },
  { key: 'throne',     label: 'The Great Hall',    glyph: '👑', synth: 'temple',   desc: 'Stone, echo, murmuring courtiers',                 query: 'castle great hall court murmur ambience' },
  { key: 'forest',     label: 'Deep Wood',         glyph: '🌲', synth: 'forest',   desc: 'Wind in leaves, birdsong, something moving',        query: 'forest woodland birds wind ambience' },
  { key: 'camp',       label: 'Night Camp',        glyph: '🔥', synth: 'camp',     desc: 'Crickets, low fire, watch after watch',             query: 'campfire night crickets ambience' },
  { key: 'swamp',      label: 'The Mire',          glyph: '🐸', synth: 'camp',     desc: 'Frogs, insects, wet ground giving way',             query: 'swamp marsh frogs insects night ambience' },
  { key: 'mountain',   label: 'High Places',       glyph: '🏔️', synth: 'blizzard', desc: 'Thin air and wind with nothing to break it',        query: 'mountain wind howling open ambience' },
  { key: 'desert',     label: 'The Waste',         glyph: '🏜️', synth: 'blizzard', desc: 'Sand, heat, and a very long way to walk',           query: 'desert wind sand dunes ambience' },
  { key: 'blizzard',   label: 'Frozen Waste',      glyph: '❄️', synth: 'blizzard', desc: 'Howling wind, ice, nowhere to shelter',             query: 'blizzard snow storm wind ambience' },
  { key: 'storm',      label: 'Storm',             glyph: '⛈️', synth: 'sea',      desc: 'Heavy rain and thunder rolling in',                 query: 'thunderstorm heavy rain thunder ambience' },
  { key: 'sea',        label: 'Ship & Open Water', glyph: '⛵', synth: 'sea',      desc: 'Waves on the hull, rigging, gulls',                 query: 'sailing ship deck waves creaking ambience' },
  { key: 'dungeon',    label: 'Beneath the Stone', glyph: '🕯️', synth: 'dungeon',  desc: 'Dripping water, low rumble, held breath',           query: 'cave dripping water dark underground ambience' },
  { key: 'crypt',      label: 'The Crypt',         glyph: '⚰️', synth: 'dungeon',  desc: 'Dust, stone, and things that should stay put',      query: 'crypt tomb eerie haunted ambience' },
  { key: 'sewer',      label: 'Under the City',    glyph: '🕳️', synth: 'dungeon',  desc: 'Running water in the dark',                         query: 'sewer tunnel dripping water echo ambience' },
  { key: 'mine',       label: 'The Deep Mine',     glyph: '⛏️', synth: 'dungeon',  desc: 'Creaking props and distant digging',                query: 'mine tunnel underground industrial ambience' },
  { key: 'graveyard',  label: 'Boneyard',          glyph: '🪦', synth: 'requiem',  desc: 'Wind through headstones',                           query: 'graveyard cemetery night wind eerie ambience' },
  { key: 'temple',     label: 'Hall of the Divine',glyph: '⛪', synth: 'temple',   desc: 'Choral fifths in a vast stone space',               query: 'cathedral church choir reverb ambience' },
  { key: 'arcane',     label: 'Arcane Laboratory', glyph: '🔮', synth: 'arcane',   desc: 'Humming wards and unstable magic',                  query: 'magic laboratory hum arcane drone ambience' },
  { key: 'fey',        label: 'Feywild Shimmer',   glyph: '✨', synth: 'fey',      desc: 'Glassy bells and detuned light',                    query: 'ethereal magical shimmer dreamy ambience' },
  { key: 'battle',     label: 'Steel & Fury',      glyph: '⚔️', synth: 'combat',   desc: 'War drums and the press of bodies',                 query: 'battle war drums combat ambience' },
  { key: 'siege',      label: 'The Siege',         glyph: '🏰', synth: 'combat',   desc: 'Distant war, closer than yesterday',                query: 'siege distant battle war crowd ambience' },
  { key: 'boss',       label: 'The Thing Itself',  glyph: '💀', synth: 'boss',     desc: 'Heartbeat, dread, something enormous',              query: 'dark ominous drone horror tension ambience' },
  { key: 'chase',      label: 'The Chase',         glyph: '🏃', synth: 'chase',    desc: 'Fast pulse, running feet, no time',                 query: 'tense chase percussion driving loop' },
  { key: 'requiem',    label: 'Requiem',           glyph: '🕊️', synth: 'requiem',  desc: 'For the fallen — slow, minor, and kind',            query: 'sad melancholy slow strings ambient' },
];

export const SFX_PACK = [
  /* ---------- combat ---------- */
  { key: 'swordClash',   label: 'Sword Clash',    glyph: '⚔️', group: 'Combat', synth: 'swordClash',  query: 'sword clash metal impact' },
  { key: 'swordDraw',    label: 'Draw Steel',     glyph: '🗡️', group: 'Combat', synth: 'swordSwing',  query: 'sword unsheathe draw metal' },
  { key: 'swordSwing',   label: 'Swing & Miss',   glyph: '🌬️', group: 'Combat', synth: 'swordSwing',  query: 'sword swing whoosh air' },
  { key: 'axeHit',       label: 'Axe Hit',        glyph: '🪓', group: 'Combat', synth: 'critical',    query: 'axe chop impact flesh wood' },
  { key: 'critical',     label: 'Critical Hit',   glyph: '💥', group: 'Combat', synth: 'critical',    query: 'heavy impact hit critical punch' },
  { key: 'bowShot',      label: 'Arrow',          glyph: '🏹', group: 'Combat', synth: 'bowShot',     query: 'arrow bow shot whoosh' },
  { key: 'arrowHit',     label: 'Arrow Hits',     glyph: '🎯', group: 'Combat', synth: 'bowShot',     query: 'arrow impact hit wood thud' },
  { key: 'shieldBash',   label: 'Shield Block',   glyph: '🛡️', group: 'Combat', synth: 'shieldBash',  query: 'shield block metal impact armor' },
  { key: 'armor',        label: 'Armor Clank',    glyph: '🥋', group: 'Combat', synth: 'shieldBash',  query: 'armor chainmail movement clank' },
  { key: 'boneCrack',    label: 'Bone Crack',     glyph: '🦴', group: 'Combat', synth: 'critical',    query: 'bone break crack snap' },
  { key: 'deathKnell',   label: 'Death Knell',    glyph: '☠️', group: 'Combat', synth: 'deathKnell',  query: 'church bell toll slow ominous' },

  /* ---------- magic ---------- */
  { key: 'fireball',     label: 'Fireball',       glyph: '🔥', group: 'Magic', synth: 'fireball',  query: 'fireball explosion fire whoosh magic' },
  { key: 'lightning',    label: 'Lightning',      glyph: '⚡', group: 'Magic', synth: 'lightning', query: 'lightning strike thunder crack' },
  { key: 'frost',        label: 'Frost',          glyph: '❄️', group: 'Magic', synth: 'frost',     query: 'ice freeze crystal magic spell' },
  { key: 'heal',         label: 'Healing',        glyph: '💚', group: 'Magic', synth: 'heal',      query: 'healing magic chime holy positive' },
  { key: 'castSpell',    label: 'Cast Spell',     glyph: '🪄', group: 'Magic', synth: 'shimmer',   query: 'magic spell cast whoosh sparkle' },
  { key: 'shimmer',      label: 'Magic Shimmer',  glyph: '✨', group: 'Magic', synth: 'shimmer',   query: 'magic sparkle shimmer twinkle' },
  { key: 'darkMagic',    label: 'Dark Magic',     glyph: '👁️', group: 'Magic', synth: 'eldritch',  query: 'dark magic evil spell demonic whoosh' },
  { key: 'teleport',     label: 'Teleport',       glyph: '🌀', group: 'Magic', synth: 'teleport',  query: 'teleport warp magic portal whoosh' },
  { key: 'portal',       label: 'Portal Opens',   glyph: '🌌', group: 'Magic', synth: 'teleport',  query: 'portal open magic rift energy' },
  { key: 'curse',        label: 'Curse',          glyph: '🖤', group: 'Magic', synth: 'eldritch',  query: 'curse dark whisper evil magic' },

  /* ---------- creatures ---------- */
  { key: 'dragon',       label: 'Dragon Roar',    glyph: '🐉', group: 'Creatures', synth: 'dragon', query: 'dragon roar monster large creature' },
  { key: 'wolf',         label: 'Wolf Howl',      glyph: '🐺', group: 'Creatures', synth: 'wolf',   query: 'wolf howl night' },
  { key: 'growl',        label: 'Beast Growl',    glyph: '🐻', group: 'Creatures', synth: 'dragon', query: 'monster growl beast snarl' },
  { key: 'goblin',       label: 'Goblin Shriek',  glyph: '👺', group: 'Creatures', synth: 'wolf',   query: 'goblin creature shriek screech small' },
  { key: 'zombie',       label: 'Undead Moan',    glyph: '🧟', group: 'Creatures', synth: 'eldritch', query: 'zombie undead groan moan' },
  { key: 'bats',         label: 'Bat Swarm',      glyph: '🦇', group: 'Creatures', synth: 'shimmer', query: 'bats wings flapping swarm cave' },
  { key: 'giantStep',    label: 'Giant Footstep', glyph: '🦶', group: 'Creatures', synth: 'portcullis', query: 'giant footstep heavy stomp earth' },
  { key: 'horse',        label: 'Horse Gallop',   glyph: '🐴', group: 'Creatures', synth: 'footsteps', query: 'horse gallop hooves running' },

  /* ---------- the world ---------- */
  { key: 'doorCreak',    label: 'Creaking Door',  glyph: '🚪', group: 'The World', synth: 'doorCreak',  query: 'wooden door creak open slow' },
  { key: 'doorSlam',     label: 'Door Slam',      glyph: '🚧', group: 'The World', synth: 'portcullis', query: 'heavy door slam shut wood' },
  { key: 'portcullis',   label: 'Portcullis',     glyph: '🏰', group: 'The World', synth: 'portcullis', query: 'stone grinding heavy gate mechanism' },
  { key: 'chest',        label: 'Chest Opens',    glyph: '🧰', group: 'The World', synth: 'chest',      query: 'wooden chest open creak treasure' },
  { key: 'lockpick',     label: 'Lockpick',       glyph: '🔓', group: 'The World', synth: 'chest',      query: 'lock picking metal click mechanism' },
  { key: 'thunder',      label: 'Thunder',        glyph: '⛈️', group: 'The World', synth: 'thunder',    query: 'thunder rumble distant storm' },
  { key: 'torch',        label: 'Torch Whoosh',   glyph: '🕯️', group: 'The World', synth: 'torch',      query: 'torch fire whoosh flame ignite' },
  { key: 'footsteps',    label: 'Footsteps',      glyph: '👣', group: 'The World', synth: 'footsteps',  query: 'footsteps stone walking echo' },
  { key: 'splash',       label: 'Water Splash',   glyph: '💧', group: 'The World', synth: 'potion',     query: 'water splash body falling in' },
  { key: 'rockslide',    label: 'Rockslide',      glyph: '🪨', group: 'The World', synth: 'portcullis', query: 'rocks falling collapse rubble debris' },
  { key: 'bell',         label: 'Alarm Bell',     glyph: '🔔', group: 'The World', synth: 'bell',       query: 'alarm bell ringing urgent tower' },
  { key: 'horn',         label: 'War Horn',       glyph: '📯', group: 'The World', synth: 'horn',       query: 'war horn blow battle call' },

  /* ---------- at the table ---------- */
  { key: 'dice',         label: 'Dice Roll',      glyph: '🎲', group: 'At the Table', synth: 'dice',    query: 'dice roll table rolling' },
  { key: 'coins',        label: 'Coin Purse',     glyph: '🪙', group: 'At the Table', synth: 'coins',   query: 'coins gold money jingle purse' },
  { key: 'levelUp',      label: 'Level Up',       glyph: '⭐', group: 'At the Table', synth: 'levelUp', query: 'level up success fanfare achievement' },
  { key: 'victory',      label: 'Victory',        glyph: '🎺', group: 'At the Table', synth: 'victory', query: 'victory fanfare triumph brass short' },
  { key: 'failure',      label: 'Grim Failure',   glyph: '📉', group: 'At the Table', synth: 'failure', query: 'fail sad trombone negative descending' },
  { key: 'cheer',        label: 'Tavern Cheer',   glyph: '🍻', group: 'At the Table', synth: 'coins',   query: 'crowd cheer celebration applause' },
  { key: 'gasp',         label: 'Crowd Gasp',     glyph: '😱', group: 'At the Table', synth: 'failure', query: 'crowd gasp shock surprise reaction' },
  { key: 'pour',         label: 'Pour a Drink',   glyph: '🍺', group: 'At the Table', synth: 'potion',  query: 'pouring liquid drink glass' },
  { key: 'quill',        label: 'Quill & Parchment', glyph: '✒️', group: 'At the Table', synth: 'chest', query: 'writing quill pen paper parchment' },
];

export const ALL_PADS = [
  ...AMBIENCE_PACK.map((p) => ({ ...p, kind: 'ambience' })),
  ...SFX_PACK.map((p) => ({ ...p, kind: 'sfx' })),
];

export const PAD_BY_KEY = Object.fromEntries(ALL_PADS.map((p) => [p.key, p]));

/* Ambiences want long, loopable beds. Effects want short, punchy hits. */
export const DURATION_FILTER = {
  ambience: '[20 TO 600]',
  sfx: '[0.2 TO 12]',
};
