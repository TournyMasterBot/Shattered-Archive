import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Endurance implements IAbility {
  private static instance: Endurance;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
endurance
c 'endurance' <target>

Endurance allows the priest to put a blessing on a person that increases
their natural health ability. The amount of increase varies from cast to
cast.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Endurance.instance === undefined) {
      Endurance.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Endurance {
    if (!Endurance.instance) {
      Endurance.instance = new Endurance();
    }
    return Endurance.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Endurance.GetInstance() as T;
  }
}

export default Endurance;
