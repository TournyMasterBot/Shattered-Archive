import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Sanctuary implements IAbility {
  private static instance: Sanctuary;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;
  abilityBuffVariable?: string | undefined;
  abilityBuffCommand?: string | undefined;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Sanctuary'
SANCTUARY
SANCTUARY
Syntax: cast sanctuary <character>
The SANCTUARY spell reduces the damage taken by the character from any attack
by one half.
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.abilityBuffCommand = "c sanctuary";

    if (Sanctuary.instance === undefined) {
      Sanctuary.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Sanctuary {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Sanctuary.GetInstance() as T;
  }
}

export default Sanctuary;
