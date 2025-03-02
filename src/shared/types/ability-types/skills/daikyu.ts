import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Daikyu implements IAbility {
  private static instance: Daikyu;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help Daikyu
daikyu
DAIKYU

Syntax: passive

Daikyu is the art of archery while riding a mount. The bow is held
asymmetrically a third of the way from the bottom to avoid bumping the
mount. This provides greater leverage when drawing the bow and using the
momentum of their mount gives arrows fired this way twice as much power.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.manualDescription = "";

    if (Daikyu.instance === undefined) {
      Daikyu.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Daikyu {
    if (!Daikyu.instance) {
      Daikyu.instance = new Daikyu();
    }
    return Daikyu.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Daikyu.GetInstance() as T;
  }
}

export default Daikyu;
