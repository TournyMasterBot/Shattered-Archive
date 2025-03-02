import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Scorch implements IAbility {
  private static instance: Scorch;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
SCORCH
Syntax:  cast scorch <target>

Drawing on the power of the sun, the Eldritch is able to learn early on 
how to harness its energy to shoot a scorching blast upon their enemy.

Groups containing this spell: ELDRITCH
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Scorch.instance === undefined) {
      Scorch.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Scorch {
    if (!Scorch.instance) {
      Scorch.instance = new Scorch();
    }
    return Scorch.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Scorch.GetInstance() as T;
  }
}

export default Scorch;
