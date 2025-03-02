
import IAbility from "@shared/types/ability-types/ability";
import Berserk from "@shared/types/ability-types/skills/Berserk";
import Gore from "@shared/types/ability-types/skills/gore";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BluntDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-blunt";
import FireDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-fire";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Minotaur implements IRace {
    private static instance: Minotaur;
    
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
        this.id = "15";
        this.name = "minotaur";
        this.displayName = "Minotaur";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = true;
        this.cpModifier = 15;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 77
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 59
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 52
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 40
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 80
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
            ...BluntDamageTypes.getAll()
        ];
        this.vulnerabilities = [
            ...FireDamageTypes.getAll()
        ];
        this.racialAbilities = [
            Gore.GetInstance().Get(),
            HandToHand.GetInstance().Get(),
            Berserk.GetInstance().Get()
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
            new Illusionist(),
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Priest(),
            new Shukenja(),
            new Bard(),
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
            new IClassBoost(new Warrior(), 20, null, null),
            new IClassBoost(new Barbarian(), 30, null, null),
            new IClassBoost(new Armsman(), 20, null, null),
            new IClassBoost(new Samurai(), 20, null, null),
            new IClassBoost(new Thief(), -10, null, null),
            new IClassBoost(new Assassin(), -10, null, null),
            new IClassBoost(new Bandit(), -20, null, null),
            new IClassBoost(new Ninja(), -10, null, null),
            new IClassBoost(new Mage(), -10, null, null),
            new IClassBoost(new Illusionist(), -10, null, null),
            new IClassBoost(new Enchantor(), -10, null, null),
            new IClassBoost(new Mentalist(), -20, null, null),
            new IClassBoost(new WuJen(), -10, null, null),
            new IClassBoost(new Druid(), -10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Bard(), -10, null, null),
            new IClassBoost(new Invoker(), -10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Minotaur.png`
        this.description = `These huge, bull-headed (literally) demihumans stand a hulking 8-10' tall.
Their torsos and limbs are humanoid: rippling chests and muscular
arms, legs, and hands. Their feet, however, end in cloven hooves. Their
whole bodies are covered with a layer of short hair. Most minotaurs,
like most humans, have only one color of fur. Minotaur horns grow to
24"" long. Minotaurs are an honor-bound race. They believe strongly in
preserving their honor and emerging victorious in the struggle for
dominance in the world. Their brutish visages belie the keen minds
within; many are smarter than the average human. Oddly, of all the many
races, minotaurs are most like a diminutive folk - the dwarves. Both
races value honor, strength, family, hard work, and the superiority of
their race.
Minotaurs receive hand to hand and berserk (if warrior) for free due to
their fighting abilities. They also have gore, where they lower their
head and try to ram their horns through their opponent. They do resist
blunt weapons well.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Minotaur {
        if (!Minotaur.instance) {
            Minotaur.instance = new Minotaur();
        }
        return Minotaur.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Minotaur.GetInstance() as T;
    }
}

export default Minotaur;