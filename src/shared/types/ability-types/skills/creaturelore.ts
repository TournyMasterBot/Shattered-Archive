import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Creaturelore implements IAbility {
  private static instance: Creaturelore;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help creaturelore
creaturelore
CREATURELORE

Syntax: Creaturelore <target>

Creature is the ability to show information about a creature that is to 
be targeted. Such information can include the creature's name, race, 
alignment, wealth, physical and magical health, level of training, weapon 
damage type, immunities and resistances, vulnerabilities and magical 
effects.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (Creaturelore.instance === undefined) {
      Creaturelore.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Creaturelore {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Creaturelore.GetInstance() as T;
  }
}

export default Creaturelore;
