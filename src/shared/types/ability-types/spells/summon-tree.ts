import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonTree implements IAbility {
  private static instance: SummonTree;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SUMMON TREE

Syntax: cast 'summon tree'
 
Drawing on the teachings of Zandreya, the Eldritch is able to call upon the
forest to draw forth a powerful tree to fight by their side. The tree uses 
its massive branches to slash down any enemy within its path. 

Groups containing this spell: ELDRITCH`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonTree.instance === undefined) {
      SummonTree.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonTree {
    if (!SummonTree.instance) {
      SummonTree.instance = new SummonTree();
    }
    return SummonTree.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonTree.GetInstance() as T;
  }
}

export default SummonTree;
