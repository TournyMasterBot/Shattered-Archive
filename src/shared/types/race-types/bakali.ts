
import IAbility from "@shared/types/ability-types/ability";
import ViperBite from "@shared/types/ability-types/skills/ViperBite";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import ColdDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-cold";
import FireDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-fire";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Bakali implements IRace {
    private static instance: Bakali;
    
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
        this.id = "41";
        this.name = "bakali";
        this.displayName = "Bakali";
        this.isLimitedRace = true;
        this.isMortalRace = true;
        this.isLargeRace = true;
        this.cpModifier = undefined;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 72
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 46
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 46
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 64
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 72
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
        this.immunities = [];
        this.resistances = [
            ...FireDamageTypes.getAll()
        ];
        this.vulnerabilities = [
            ...ColdDamageTypes.getAll()
        ];
        this.racialAbilities = [
            ViperBite.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Armsman(),
            new Samurai(),
            new Thief(),
            new Assassin(),
            new Bandit(),
            new Pirate(),
            new Ninja(),
            new Mage(),
            new Witch(),
            new Warlock(),
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
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]> /*
        new IClassBoost(new Armsman(), 20, null, null),
        new IClassBoost(new Samurai(), 10, null, null),
        new IClassBoost(new Assassin(), 20, null, null),
        new IClassBoost(new Bandit(), 20, null, null),
        new IClassBoost(new Ninja(), 10, null, null),
        new IClassBoost(new Warlock(), 10, null, null),
        new IClassBoost(new Shaman(), 10, null, null),
        new IClassBoost(new Shukenja(), 10, null, null),*/
        ;
        this.imageUrl = `https://shatteredarchive.com/img/races/Bakali.png`
        this.description = `The Bakali are a scaled repitilian race who stand almost 7 feet tall and
on two feet.  They have a head similar to that of a Cobra.  Their scales
come in red, black, green, white or blue which makes some people believe
they are the offspring of some sort of Chromatic Dragon.  They are known for
their extremely bad tempers and have been to known to kill even their own
kind with very little cause.  Bakali have a naturally venomous bite that has
been known to paralyze their victims.  

The Bakali are native to the Tropica continent where they lived for
centuries in seclusion, warring anything that invaded their territory.  They
have only recently been driven out by the forces of Chaos.  It has been said
that the Bakali grow even larger and more powerful with age.  

Bakali cannot be Bards, swashbucklers, Nightshades, Illusionists, or
Enchantors. 

Bakali growth unlock at 1000 hours, +10 hit, +10 dam, -25 ac. Viperbite will prevent fleeing when used used to init on a full health enemy for the remainder of the tick.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Bakali {
        if (!Bakali.instance) {
            Bakali.instance = new Bakali();
        }
        return Bakali.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Bakali.GetInstance() as T;
    }
}

export default Bakali;