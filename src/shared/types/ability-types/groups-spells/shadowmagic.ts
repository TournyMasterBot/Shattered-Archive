import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Umbra from "@shared/types/ability-types/spells/Umbra";
import KayensShield from "@shared/types/ability-types/spells/KayensShield";
import ShadowVision from "@shared/types/ability-types/spells/ShadowVision";
import Shadowcloak from "@shared/types/ability-types/spells/Shadowcloak";
import StealMagic from "@shared/types/ability-types/spells/StealMagic";
import Shadowbolt from "@shared/types/ability-types/spells/Shadowbolt";
import SummonShadow from "@shared/types/ability-types/spells/SummonShadow";
import HostOfGargoyles from "@shared/types/ability-types/spells/HostOfGargoyles";
import AcuteEvasion from "@shared/types/ability-types/spells/AcuteEvasion";
import NightTerror from "@shared/types/ability-types/spells/NightTerror";
import Shadowlord from "@shared/types/ability-types/spells/Shadowlord";
import PraiseTheProphecy from "@shared/types/ability-types/spells/PraiseTheProphecy";
import RedirectSkill from "@shared/types/ability-types/spells/RedirectSkill";
import Deflection from "@shared/types/ability-types/spells/Deflection";
import ShadowWhisper from "@shared/types/ability-types/spells/ShadowWhisper";
import ShadowVortex from "@shared/types/ability-types/spells/ShadowVortex";
import CreateCauldron from "@shared/types/ability-types/spells/CreateCauldron";
import NightShield from "@shared/types/ability-types/spells/NightShield";
import ServerCache from "@shared/cache/server-cache";

export class Shadowmagic implements IAbilityGroup {
  static instance: Shadowmagic;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Shadowmagic;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Umbra.GetInstance(),
      NightShield.GetInstance(),
      KayensShield.GetInstance(),
      ShadowVision.GetInstance(),
      Shadowcloak.GetInstance(),
      StealMagic.GetInstance(),
      Shadowbolt.GetInstance(),
      SummonShadow.GetInstance(),
      HostOfGargoyles.GetInstance(),
      AcuteEvasion.GetInstance(),
      NightTerror.GetInstance(),
      Shadowlord.GetInstance(),
      PraiseTheProphecy.GetInstance(),
      RedirectSkill.GetInstance(),
      Deflection.GetInstance(),
      ShadowWhisper.GetInstance(),
      ShadowVortex.GetInstance(),
      CreateCauldron.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Shadowmagic {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Shadowmagic.GetInstance() as T;
  }
}

export default Shadowmagic;
