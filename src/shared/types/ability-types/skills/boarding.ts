import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Boarding implements IAbility {
  private static instance: Boarding;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
BOARDING
The swashbuckler is the undisputed master of the sea. With reflexes as
quick as a fox he is able to scramble up the sides of ships without them
being docked. Woe be to the unsuspecting crew that concentrates their fire
upon his ship while he attacks from within theirs.
        `;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (Boarding.instance === undefined) {
      Boarding.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Boarding {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Boarding.GetInstance() as T;
  }
}

export default Boarding;
