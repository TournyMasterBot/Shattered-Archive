import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Slow implements IAbility {
  private static instance: Slow;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help slow
SLOW
SLOW
Syntax: cast 'slow' <target>
Despite popular mythology, slow is not the opposite of haste, but is a spell
with its own unique set of effects. When cast on an unfortunate victim,
it slows its movements, making it easier to hit and reducing its rate
of attack. The effect of slow also doubles movement costs and halves healing
rates, due to reduced metabolism.`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Slow.instance === undefined) {
      Slow.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Slow {
    if (!Slow.instance) {
      Slow.instance = new Slow();
    }
    return Slow.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Slow.GetInstance() as T;
  }
}

export default Slow;
