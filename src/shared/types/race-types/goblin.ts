
import IAbility from "@shared/types/ability-types/ability";
import Envenom from "@shared/types/ability-types/skills/Envenom";
import Spit from "@shared/types/ability-types/skills/Spit";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import PoisonDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-poison";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Goblin implements IRace {
    private static instance: Goblin;
    
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
        this.id = "21";
        this.name = "goblin";
        this.displayName = "Goblin";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 5;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 52
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 60
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 48
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 83
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 58
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
            ...PoisonDamageTypes.getAll()
        ];
        this.resistances = [
        ];
        this.vulnerabilities = [
        ];
        this.racialAbilities = [
            Envenom.GetInstance().Get(),
            Spit.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Barbarian(),
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
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Bard(),
            new Jongleur(),
            new Charlatan(),
            new Skald(),
            new Brewmaster(),
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
            new IClassBoost(new Thief(), 10, null, null),
            new IClassBoost(new Bandit(), 10, null, null),
            new IClassBoost(new Nightshade(), 10, null, null),
            new IClassBoost(new Ninja(), 20, null, null),
            new IClassBoost(new Mage(), -10, null, null),
            new IClassBoost(new Illusionist(), -10, null, null),
            new IClassBoost(new Warlock(), 10, null, null),
            new IClassBoost(new Enchantor(), -10, null, null),
            new IClassBoost(new Mentalist(), -10, null, null),
            new IClassBoost(new WuJen(), 10, null, null),
            new IClassBoost(new Cleric(), -10, null, null),
            new IClassBoost(new Crusader(), -10, null, null),
            new IClassBoost(new Shaman(), 10, null, null),
            new IClassBoost(new Priest(), -10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Bard(), -20, null, null),
            new IClassBoost(new Jongleur(), -10, null, null),
            new IClassBoost(new Charlatan(), 10, null, null),
            new IClassBoost(new Skald(), -20, null, null),
            new IClassBoost(new Brewmaster(), 10, null, null),
            new IClassBoost(new Necromancer(), -10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Goblin.png`
        this.description = `Goblins are short, flat nosed creature with green skin; they stand about 4
feet tall and weigh about 150 lbs.  They have fangs, and (reputedly)
poisonous blood.  Goblins are on the whole unpleasant and brutal creatures. 
Although some folk have known non-Evil goblins, or even intelligent ones,
these examples are clearly exceptions.  Most goblin folk are honorless
brutes who want to kill, eat, sleep, and pass gas.

Goblins heal when poisoned.
`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Goblin {
        if (!Goblin.instance) {
            Goblin.instance = new Goblin();
        }
        return Goblin.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Goblin.GetInstance() as T;
    }
}

export default Goblin;