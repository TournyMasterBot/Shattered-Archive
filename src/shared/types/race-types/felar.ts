
import IAbility from "@shared/types/ability-types/ability";
import NineLives from "@shared/types/ability-types/skills/NineLives";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import FireDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-fire";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Felar implements IRace {
    private static instance: Felar;
    
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
        this.id = "32";
        this.name = "felar";
        this.displayName = "Felar";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 15;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 30
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 55
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 70
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 92
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 45
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
        this.resistances = [];
        this.vulnerabilities = [
            ...FireDamageTypes.getAll()
        ];
        this.racialAbilities = [
            NineLives.GetInstance().Get()
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
            new IClassBoost(new Barbarian(), 10, null, null),
            new IClassBoost(new Ranger(), 10, null, null),
            new IClassBoost(new Armsman(), -10, null, null),
            new IClassBoost(new Thief(), 10, null, null),
            new IClassBoost(new Nightshade(), 10, null, null),
            new IClassBoost(new Ninja(), 20, null, null),
            new IClassBoost(new WuJen(), 20, null, null),
            new IClassBoost(new Druid(), 10, null, null),
            new IClassBoost(new Shukenja(), -10, null, null),
            new IClassBoost(new Bard(), -10, null, null),
            new IClassBoost(new Jongleur(), 10, null, null),
            new IClassBoost(new Skald(), -10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Felar.png`
        this.description = `Felars are the female version of Leonines.  They are sleek and slender
and are know for both their agility and "nine lives".  Felar have slim
feminine bodies that are covered in fur and have cat-like faces and long
tails.  Felar tend to be smaller than humans, averaging about 5' in height. 
They have very muscular builds, though, more so than would be expected.  Fur
on felars can run from almost none to 90% of their body covered.  Their
colorings vary.  
Felar make great thieves and decent clerics, warriors, and mages.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Felar {
        if (!Felar.instance) {
            Felar.instance = new Felar();
        }
        return Felar.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Felar.GetInstance() as T;
    }
}

export default Felar;