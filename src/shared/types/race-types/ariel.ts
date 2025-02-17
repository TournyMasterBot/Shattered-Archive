
import IAbility from "@shared/types/ability-types/ability";
import Screech from "@shared/types/ability-types/skills/screech";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Ariel implements IRace {
    private static instance: Ariel;
    
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
        this.id = "37";
        this.name = "ariel";
        this.displayName = "Ariel";
        this.isLimitedRace = true;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = undefined;
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
                modifier: 70
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 70
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 40
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
        ];
        this.vulnerabilities = [
        ];
        this.racialAbilities = [
            Screech.GetInstance().Get()
        ]
        this.availableClasses = [
            /* new Warrior(),
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
                    new Battlemage()*/
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]> /* 
        new IClassBoost(new Barbarian(), 20, null, null),
        new IClassBoost(new Ranger(), 20, null, null),
        new IClassBoost(new Armsman(), 20, null, null),
        new IClassBoost(new Samurai(), 10, null, null),
        new IClassBoost(new Assassin(), 20, null, null),
        new IClassBoost(new Ninja(), 10, null, null),
        new IClassBoost(new WuJen(), 10, null, null),
        new IClassBoost(new Crusader(), 20, null, null),
        new IClassBoost(new Druid(), 20, null, null),
        new IClassBoost(new Shaman(), 20, null, null),
        new IClassBoost(new Shukenja(), 10, null, null),
        new IClassBoost(new Jongleur(), 20, null, null),
        new IClassBoost(new Brewmaster(), -10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Ariel.png`
        this.description = `The Ariel appears humanoid with the exception of their brightly colored
wings that arch out from behind their backs.  Their bones are a bit lighter
than humans making them have a lower constitution but they are rumored to be
faster than humans.  Ariel can fly, sometimes covering large distances and
over oceans.  The Ariel society is that of learning, honor and courage. 
Historically, they battled the Chromatic Dragons for the skies above
Tropica.  

They are known throughout the land as ""tree dwellers"" because their
settlements were built in the tall trees and jungles of Tropica before
driven out by the forces of Chaos.  
 
Ariel cannot be swashbucklers, nightshade or charlatans.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Ariel {
        if (!Ariel.instance) {
            Ariel.instance = new Ariel();
        }
        return Ariel.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Ariel.GetInstance() as T;
    }
}

export default Ariel;