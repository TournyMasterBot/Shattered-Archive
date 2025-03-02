import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Disjunction implements IAbility {
  private static instance: Disjunction;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
DISJUNCTION

Syntax: c 'disjunction' <target>

Disjunction is a spell available to transmuters. It causes significant
damage while at the same time attempting to dispel your opponent's magical
protection.

See also - ALTERATION TRANSMUTER
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Disjunction.instance === undefined) {
      Disjunction.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Disjunction {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Disjunction.GetInstance() as T;
  }
}

export default Disjunction;
