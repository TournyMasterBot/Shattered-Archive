import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Retainer implements IAbility {
  private static instance: Retainer;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Retainer";
    this.helpFile = `
retainer
RETAINER

Syntax: retainer <target>

For centuries the order of the Samurai were revered as the best bodyguards
of the Royal Families of Shokono. The training for this level of protection
is evident in the retainer ability, allowing the Samurai to passively rescue
the retained target each combat round.  
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Retainer.instance === undefined) {
      Retainer.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Retainer {
    if (!Retainer.instance) {
      Retainer.instance = new Retainer();
    }
    return Retainer.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Retainer.GetInstance() as T;
  }
}

export default Retainer;
