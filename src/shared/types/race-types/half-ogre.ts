
import IAbility from "@shared/types/ability-types/ability";
import FastHealing from "@shared/types/ability-types/skills/FastHealing";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import { MentalDamageTypes } from "@shared/types/damage-types/damage-type-group-models/groups-mental";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class HalfOgre implements IRace {
    private static instance: HalfOgre;
    
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
        this.id = "18";
        this.name = "halfogre";
        this.displayName = "Half Ogre";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = true;
        this.cpModifier = 8;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 76
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 46
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 49
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 51
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 78
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
            ...MentalDamageTypes.getAll()
        ];
        this.racialAbilities = [
            FastHealing.GetInstance().Get()
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
            new IClassBoost(new Swashbuckler(), -10, null, null),
            new IClassBoost(new Armsman(), 10, null, null),
            new IClassBoost(new Samurai(), 20, null, null),
            new IClassBoost(new Assassin(), -10, null, null),
            new IClassBoost(new Bandit(), 10, null, null),
            new IClassBoost(new Nightshade(), -10, null, null),
            new IClassBoost(new Ninja(), 20, null, null),
            new IClassBoost(new Mage(), -10, null, null),
            new IClassBoost(new Illusionist(), -10, null, null),
            new IClassBoost(new Warlock(), -10, null, null),
            new IClassBoost(new Enchantor(), -10, null, null),
            new IClassBoost(new Mentalist(), -20, null, null),
            new IClassBoost(new WuJen(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Bard(), -10, null, null),
            new IClassBoost(new Jongleur(), -20, null, null),
            new IClassBoost(new Skald(), 10, null, null),
            new IClassBoost(new Brewmaster(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/HalfOgre.png`
        this.description = `Crossbreeds between humans and ogres, they look like humans but are slightly
larger.  They resemble human throwbacks to the time of caves and clubs. 
They are not as intelligent as humans but more intelligent than ogres.  They
do carry their ogre blood vulnerability to mental attacks.  They get fast
healing for free.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): HalfOgre {
        if (!HalfOgre.instance) {
            HalfOgre.instance = new HalfOgre();
        }
        return HalfOgre.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return HalfOgre.GetInstance() as T;
    }
}

export default HalfOgre;