import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Demonfire from "@shared/types/ability-types/spells/demonfire";
import Earthquake from "@shared/types/ability-types/spells/earthquake";
import RayOfTruth from "@shared/types/ability-types/spells/ray-of-truth";
import DispelEvil from "@shared/types/ability-types/spells/dispel-evil";
import Flamestrike from "@shared/types/ability-types/spells/flamestrike";
import DispelNeutral from "@shared/types/ability-types/spells/dispel-neutral";
import DispelGood from "@shared/types/ability-types/spells/dispel-good";
import HeatMetal from "@shared/types/ability-types/spells/heat-metal";
import ServerCache from "@shared/cache/server-cache";

export class Attack implements IAbilityGroup {
  static instance: Attack;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Attack;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Demonfire.GetInstance(),
      Earthquake.GetInstance(),
      RayOfTruth.GetInstance(),
      DispelEvil.GetInstance(),
      Flamestrike.GetInstance(),
      DispelNeutral.GetInstance(),
      DispelGood.GetInstance(),
      HeatMetal.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Attack {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Attack.GetInstance() as T;
  }
}

export default Attack;
