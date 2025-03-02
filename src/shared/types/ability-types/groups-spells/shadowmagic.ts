import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Umbra from "@shared/types/ability-types/spells/umbra";
import KayensShield from "@shared/types/ability-types/spells/kayens-shield";
import ShadowVision from "@shared/types/ability-types/spells/shadow-vision";
import Shadowcloak from "@shared/types/ability-types/spells/shadowcloak";
import StealMagic from "@shared/types/ability-types/spells/steal-magic";
import Shadowbolt from "@shared/types/ability-types/spells/shadowbolt";
import SummonShadow from "@shared/types/ability-types/spells/summon-shadow";
import HostOfGargoyles from "@shared/types/ability-types/spells/host-of-gargoyles";
import AcuteEvasion from "@shared/types/ability-types/spells/acute-evasion";
import NightTerror from "@shared/types/ability-types/spells/night-terror";
import Shadowlord from "@shared/types/ability-types/spells/shadowlord";
import PraiseTheProphecy from "@shared/types/ability-types/spells/praise-the-prophecy";
import RedirectSkill from "@shared/types/ability-types/spells/redirect-skill";
import Deflection from "@shared/types/ability-types/spells/deflection";
import ShadowWhisper from "@shared/types/ability-types/spells/shadow-whisper";
import ShadowVortex from "@shared/types/ability-types/spells/shadow-vortex";
import CreateCauldron from "@shared/types/ability-types/spells/create-cauldron";
import NightShield from "@shared/types/ability-types/spells/nightshield";
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
