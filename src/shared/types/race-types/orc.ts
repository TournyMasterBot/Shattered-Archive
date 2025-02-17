
import IAbility from "@shared/types/ability-types/ability";
import Fury from "@shared/types/ability-types/skills/fury";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Orc implements IRace {
    private static instance: Orc;
    
    public id: string;
    public imageUrl: string;
    public description?: string | undefined;
    public cpModifier?: number | undefined;
    public name: string;
    public displayName: string;
    public isLimitedRace: boolean;
    public isMortalRace: boolean;
    public isLargeRace: boolean;
    public stats: IStatAttribute[];
    public primaryAttributeModifier: IStatAttribute;
    public secondaryAttributeModifier: IStatAttribute;
    public immunities: IDamageType[];
    public resistances: IDamageType[];
    public vulnerabilities: IDamageType[];
    public racialAbilities: IAbility[];
    public availableClasses: IDslClass[];
    public restrictedClasses: IDslClass[];
    public boostedClasses: Map<IDslClass, BoostedClass[]>;

    constructor() {
        this.id = "40";
        this.name = "orc";
        this.displayName = "Orc";
        this.isLimitedRace = true;
        this.isMortalRace = true;
        this.isLargeRace = true;
        this.cpModifier = undefined;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 70
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 60
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 55
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 60
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 70
            })
        ]
        this.primaryAttributeModifier = new StatAttribute({
            type: StatAttributeType.Variable,
            modifier: 8
        });
        this.secondaryAttributeModifier = new StatAttribute({
            type: StatAttributeType.Variable,
            modifier: 4
        });
        this.immunities = [
        ];
        this.resistances = [
        ];
        this.vulnerabilities = [
        ];
        this.racialAbilities = [
            Fury.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Swashbuckler(),
            new Armsman(),
            new Samurai(),
            new Thief(),
            new Assassin(),
            new Bandit(),
            new Pirate(),
            new Nightshade(),
            new Ninja(),
            new Mage(),
            new Illusionist(),
            new Witch(),
            new Warlock(),
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Monk(),
            new Dragonslayer(),
            new Invoker(),
            new Transmuter(),
            new Necromancer(),
            new Battlemage()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Warrior(), 10, null, null),
            new IClassBoost(new Barbarian(), 10, null, null),
            new IClassBoost(new Armsman(), 20, null, null),
            new IClassBoost(new Samurai(), 10, null, null),
            new IClassBoost(new Thief(), 10, null, null),
            new IClassBoost(new Assassin(), 10, null, null),
            new IClassBoost(new Bandit(), 20, null, null),
            new IClassBoost(new Ninja(), 10, null, null),
            new IClassBoost(new Mage(), -10, null, null),
            new IClassBoost(new WuJen(), -10, null, null),
            new IClassBoost(new Crusader(), 10, null, null),
            new IClassBoost(new Druid(), -10, null, null),
            new IClassBoost(new Shaman(), 10, null, null),
            new IClassBoost(new Priest(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Dragonslayer(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Orc.png`
        this.description = `At 6'5 to 7' tall, Orcs are monsterous creatures to behold.  Owing to
their wild nature, Orcs have a wide variety of features that makes each Orc
unique, including, but not limited to, pupilless glowing eyes, and both
upward and downward jutting large tusks that may or may not appear on any
given Orc, despite what features the parents had.  They come in a varying
shades of green and yellow, but like all their wild brethren, are one of
these two hues.  

Wild Orcs are more like beasts than sentient men, and are scattered across
all Algoron having no real home.  The Centaurs collected Wild Orcs from all
the corners of the globe and bred them into slaves.  Keeping only the most
intelligent and sturdy orcs, they forcefully evolved them into a strong work
force which they used as slave labor in mines.  During Malachive's rampage
across Algoron, he saw the Orcs plight and freed them from captivity, though
many of the Orcs who saw him thought him a mortal man when they viewed him.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Orc {
        if (!Orc.instance) {
            Orc.instance = new Orc();
        }
        return Orc.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Orc.GetInstance() as T;
    }
}

export default Orc;