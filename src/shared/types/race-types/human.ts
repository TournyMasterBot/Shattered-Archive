
import IAbility from "@shared/types/ability-types/ability";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Human implements IRace {
    private static instance: Human;
    
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
        this.id = "1";
        this.name = "human";
        this.displayName = "Human";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 0;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 60
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 60
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 60
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 60
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 60
            })
        ]
        this.primaryAttributeModifier = new StatAttribute({
            type: StatAttributeType.Variable,
            modifier: 10
        });
        this.secondaryAttributeModifier = new StatAttribute({
            type: StatAttributeType.Variable,
            modifier: 6
        });
        this.immunities = [
        ];
        this.resistances = [
        ];
        this.vulnerabilities = [
            
        ];
        this.racialAbilities = [
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
            new Bard(),
            new Jongleur(),
            new Charlatan(),
            new Skald(),
            new Brewmaster(),
            new Monk(),
            new Dragonslayer(),
            new Invoker(),
            new Transmuter(),
            new Necromancer(),
            new Battlemage(),
            new Paladin(),
            new Confessor(),
            new Shadowknight(),
            new Shadowmage()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Ranger(), 10, null, null),
            new IClassBoost(new Swashbuckler(), 10, null, null),
            new IClassBoost(new Armsman(), 10, null, null),
            new IClassBoost(new Samurai(), 20, null, null),
            new IClassBoost(new Assassin(), 10, null, null),
            new IClassBoost(new Bandit(), 10, null, null),
            new IClassBoost(new Ninja(), 20, null, null),
            new IClassBoost(new Mage(), 10, null, null),
            new IClassBoost(new Mentalist(), 20, null, null),
            new IClassBoost(new WuJen(), 20, null, null),
            new IClassBoost(new Cleric(), 10, null, null),
            new IClassBoost(new Crusader(), 20, null, null),
            new IClassBoost(new Priest(), 10, null, null),
            new IClassBoost(new Shukenja(), 20, null, null),
            new IClassBoost(new Bard(), 10, null, null),
            new IClassBoost(new Skald(), 10, null, null),
            new IClassBoost(new Brewmaster(), 20, null, null),
            new IClassBoost(new Shadowknight(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Human.png`
        this.description = `Humans are the most common race in the world, and make up the majority of
adventurers.  Although they have no special talents like the other races,
they are more versatile, being skilled in all five classes, and their
associated reclasses.  Humans gain a larger bonus to their primary and
secondary stats compared to other races.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Human {
        if (!Human.instance) {
            Human.instance = new Human();
        }
        return Human.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Human.GetInstance() as T;
    }
}

export default Human;