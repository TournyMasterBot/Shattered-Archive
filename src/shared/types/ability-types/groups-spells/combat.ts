import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import AcidBlast from "@shared/types/ability-types/spells/AcidBlast";
import ChillTouch from "@shared/types/ability-types/spells/ChillTouch";
import MagicMissile from "@shared/types/ability-types/spells/MagicMissile";
import BurningHands from "@shared/types/ability-types/spells/burning-hands";
import ColorSpray from "@shared/types/ability-types/spells/ColorSpray";
import ShockingGrasp from "@shared/types/ability-types/spells/ShockingGrasp";
import ChainLightning from "@shared/types/ability-types/spells/ChainLightning";
import Fireball from "@shared/types/ability-types/spells/Fireball";
import Blizzra from "@shared/types/ability-types/spells/Blizzra";
import ServerCache from "@shared/cache/server-cache";

export class Combat implements IAbilityGroup {
  static instance: Combat;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Combat;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      AcidBlast.GetInstance(),
      ChillTouch.GetInstance(),
      MagicMissile.GetInstance(),
      BurningHands.GetInstance(),
      ColorSpray.GetInstance(),
      ShockingGrasp.GetInstance(),
      ChainLightning.GetInstance(),
      Fireball.GetInstance(),
      Blizzra.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Combat {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Combat.GetInstance() as T;
  }
}

export default Combat;
