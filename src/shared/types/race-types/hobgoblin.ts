
import IAbility from "@shared/types/ability-types/ability";
import Spit from "@shared/types/ability-types/skills/Spit";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class HobGoblin implements IRace {
    private static instance: HobGoblin;
    
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
        this.id = "22";
        this.name = "hobgoblin";
        this.displayName = "Hobgoblin";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 8;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 65
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 55
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
                modifier: 65
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
            Spit.GetInstance().Get()
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
            new Mentalist(),
            new WuJen(),
            new Cleric(),
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
            new IClassBoost(new Warrior(), 20, null, null),
            new IClassBoost(new Barbarian(), 10, null, null),
            new IClassBoost(new Armsman(), 10, null, null),
            new IClassBoost(new Samurai(), -10, null, null),
            new IClassBoost(new Thief(), 10, null, null),
            new IClassBoost(new Assassin(), 20, null, null),
            new IClassBoost(new Ninja(), 10, null, null),
            new IClassBoost(new Illusionist(), -10, null, null),
            new IClassBoost(new Mentalist(), -10, null, null),
            new IClassBoost(new WuJen(), -10, null, null),
            new IClassBoost(new Shaman(), 10, null, null),
            new IClassBoost(new Priest(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Skald(), -20, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Hobgoblin.png`
        this.description = `Hobgoblins are larger cousins of goblins.  They are far more aggressive and
organized than their smaller relatives.  Hobgoblins stand 6 1/2 feet tall. 
Their hairy hides range in coloration from dark reddish-brown to dark-gray,
with dark or red-orange skin.  

Hobgoblins are a military breed.  They live for war and believe strongly in
strength and martial prowess as the most desirable qualities in individuals
and leaders alike.  

Hobgoblins prefer to be warriors and assassins and their clerics are fond of
both Raije and Fatale.  

See also - GOBLIN BUGBEAR`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): HobGoblin {
        if (!HobGoblin.instance) {
            HobGoblin.instance = new HobGoblin();
        }
        return HobGoblin.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return HobGoblin.GetInstance() as T;
    }
}

export default HobGoblin;